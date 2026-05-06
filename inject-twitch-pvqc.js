(function () {
  let active = true;
  window.__aqPvqcActive = true;

  let lastVisChange = 0;
  let blockedCount = 0;
  let lastBlockReset = 0;
  const SUPPRESS_WINDOW_MS = 500;
  const MAX_BLOCKS_PER_SEC = 3;
  const BG_PAUSE_WINDOW_MS = 1000;
  const STUCK_CHECK_MS = 2500;
  const STUCK_CONFIRM_MS = 500;
  const RELOAD_DELAY_MS = 200;
  const RELOAD_COOLDOWN_MS = 5000;
  const bgPausedSet = new Set();
  let lastWrappedPlayer = null;
  let lastReloadAt = 0;

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
    lastWrappedPlayer = player;

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

  function isAnyVideoStuck() {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (!v.isConnected || v.ended) continue;
      if (v.readyState < 3) return true;
    }
    return false;
  }

  function triggerPlayerReload() {
    if (performance.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return;
    const p = lastWrappedPlayer;
    if (!p) return;
    lastReloadAt = performance.now();
    try {
      if (typeof p.pause === "function") p.pause();
    } catch (e) {}
    setTimeout(() => {
      try {
        if (typeof p.play === "function") p.play();
      } catch (e) {}
    }, RELOAD_DELAY_MS);
  }

  function checkStuck() {
    if (!active) return;
    if (!isAnyVideoStuck()) return;
    setTimeout(() => {
      if (!active) return;
      if (isAnyVideoStuck()) triggerPlayerReload();
    }, STUCK_CONFIRM_MS);
  }

  function resumeBgPaused() {
    if (!active) return;
    if (bgPausedSet.size > 0) {
      tryResumeOnce();
      setTimeout(tryResumeOnce, 500);
      setTimeout(tryResumeOnce, 1500);
    }
    setTimeout(checkStuck, STUCK_CHECK_MS);
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
