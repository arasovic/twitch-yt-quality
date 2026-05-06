(function () {
  let active = true;
  window.__aqPvqcActive = true;

  let lastVisChange = 0;
  let blockedCount = 0;
  let lastBlockReset = 0;
  const SUPPRESS_WINDOW_MS = 500;
  const MAX_BLOCKS_PER_SEC = 3;
  const BG_PAUSE_WINDOW_MS = 1000;
  const bgPausedSet = new Set();

  function markVisChange() {
    lastVisChange = performance.now();
  }

  window.addEventListener("visibilitychange", markVisChange, true);
  document.addEventListener("visibilitychange", markVisChange, true);
  window.addEventListener("blur", markVisChange, true);
  window.addEventListener("freeze", markVisChange, true);

  function shouldSuppress() {
    if (!active) return false;
    const now = performance.now();
    if (now - lastVisChange > SUPPRESS_WINDOW_MS) return false;
    if (now - lastBlockReset > 1000) {
      blockedCount = 0;
      lastBlockReset = now;
    }
    if (blockedCount >= MAX_BLOCKS_PER_SEC) return false;
    return true;
  }

  function recordBlock() {
    blockedCount++;
    if (blockedCount === 1) lastBlockReset = performance.now();
  }

  const origPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    if (shouldSuppress()) {
      recordBlock();
      const v = this;
      bgPausedSet.add(v);
      setTimeout(() => {
        if (v.paused && v.readyState >= 2) {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      }, 50);
      return;
    }
    if (active && performance.now() - lastVisChange < BG_PAUSE_WINDOW_MS) {
      bgPausedSet.add(this);
    }
    return origPause.call(this);
  };

  const wrappedPlayers = new WeakSet();

  function wrapPlayer(player) {
    if (!player || wrappedPlayers.has(player)) return;
    wrappedPlayers.add(player);

    const stateRegex = /(idle|pause|stop|ended|background)/i;

    if (typeof player.emit === "function") {
      const origEmit = player.emit.bind(player);
      player.emit = function (event, ...args) {
        if (typeof event === "string" && stateRegex.test(event) && shouldSuppress()) {
          recordBlock();
          return;
        }
        return origEmit(event, ...args);
      };
    }

    if (typeof player.onStateChanged === "function") {
      const origState = player.onStateChanged.bind(player);
      player.onStateChanged = function (state, ...args) {
        const s = state && (state.type || state.name || state);
        if (typeof s === "string" && stateRegex.test(s) && shouldSuppress()) {
          recordBlock();
          return;
        }
        return origState(state, ...args);
      };
    }

    ["pause", "stop", "onIdle"].forEach((m) => {
      if (typeof player[m] === "function") {
        const orig = player[m].bind(player);
        player[m] = function (...args) {
          if (shouldSuppress()) {
            recordBlock();
            return;
          }
          return orig(...args);
        };
      }
    });
  }

  function findPlayer() {
    const nodes = document.querySelectorAll("div,section,main");
    for (const el of nodes) {
      for (const key in el) {
        if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactProps$")) continue;
        let node = el[key];
        while (node) {
          const props = node.pendingProps || node.memoizedProps;
          if (props) {
            if (props.mediaPlayerInstance) return props.mediaPlayerInstance;
            if (props.player) return props.player;
          }
          node = node.return;
        }
      }
    }
    return null;
  }

  let playerScanAttempts = 0;
  const MAX_PLAYER_SCANS = 40;

  function scanForPlayer() {
    const p = findPlayer();
    if (p) {
      wrapPlayer(p);
      return;
    }
    playerScanAttempts++;
    if (playerScanAttempts < MAX_PLAYER_SCANS) {
      setTimeout(scanForPlayer, 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanForPlayer, { once: true });
  } else {
    scanForPlayer();
  }

  setInterval(() => {
    const p = findPlayer();
    if (p) wrapPlayer(p);
  }, 5000);

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "aq_pvqc_toggle") {
      active = !!e.data.enabled;
      window.__aqPvqcActive = active;
      if (active) {
        playerScanAttempts = 0;
        scanForPlayer();
      } else {
        bgPausedSet.clear();
      }
    }
  });

  function tryResumeOnce() {
    if (!active) return;
    bgPausedSet.forEach((v) => {
      if (!v.isConnected || v.ended) {
        bgPausedSet.delete(v);
        return;
      }
      if (!v.paused) {
        bgPausedSet.delete(v);
        return;
      }
      if (v.readyState >= 2) {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    });
  }

  function resumeBgPaused() {
    if (!active) return;
    if (bgPausedSet.size === 0) return;
    tryResumeOnce();
    setTimeout(tryResumeOnce, 500);
    setTimeout(tryResumeOnce, 1500);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") resumeBgPaused();
    },
    true
  );
  window.addEventListener("focus", resumeBgPaused, true);

  window.__aqPvqcStats = function () {
    return {
      active,
      lastVisChangeAgo: lastVisChange ? performance.now() - lastVisChange : null,
      blockedCount,
      bgPausedTracked: bgPausedSet.size,
      windowMs: SUPPRESS_WINDOW_MS,
      maxPerSec: MAX_BLOCKS_PER_SEC,
    };
  };
})();
