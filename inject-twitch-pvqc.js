(function () {
  let active = true;
  window.__aqPvqcActive = true;

  let lastVisChange = 0;
  let blockedCount = 0;
  let lastBlockReset = 0;
  const SUPPRESS_WINDOW_MS = 500;
  const MAX_BLOCKS_PER_SEC = 3;
  const STUCK_CHECK_MS = 2500;
  const STUCK_CONFIRM_MS = 500;
  const STUCK_CT_WINDOW_MS = 1500;
  const RELOAD_DELAY_MS = 200;
  const RELOAD_COOLDOWN_MS = 5000;
  const HARD_RELOAD_AFTER_MS = 1500;
  const WAIT_STUCK_MS = 2000;
  const STUCK_WATCH_DURATION_MS = 30000;
  const STUCK_WATCH_INTERVAL_MS = 1000;
  const STUCK_WATCH_GRACE_MS = 1500;
  const FRAME_TIMEOUT_MS = 2500;
  const SPINNER_CHECK_INTERVAL_MS = 1000;
  const SPINNER_PERSIST_MS = 5000;
  const SPINNER_SELECTORS = [
    '[data-a-target="player-loading"]',
    ".tw-loading-spinner",
    ".player-loading-spinner__container",
    "figure.video-player__loading-spinner",
  ];
  const stuckSamples = new WeakMap();
  const wiredVideos = new WeakSet();
  const waitingTimers = new WeakMap();
  let pendingWaitCount = 0;
  let lastWrappedPlayer = null;
  let lastReloadAt = 0;
  let stuckWatchTimer = null;
  let stuckWatchEndAt = 0;
  let stuckWatchLastCt = -1;
  let stuckWatchLastChange = 0;
  let frameWatchActive = false;
  let frameWatchVideo = null;
  let frameWatchHandle = null;
  let frameWatchTimeoutTimer = null;
  let frameWatchEndAt = 0;
  let lastFrameAt = 0;
  let spinnerWatchTimer = null;
  let spinnerWatchEndAt = 0;
  let spinnerVisibleSince = 0;
  let lastSpinnerSelector = null;

  function markVisChange() {
    lastVisChange = performance.now();
  }

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
      setTimeout(() => {
        if (v.paused && v.readyState >= 2) {
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      }, 50);
      return;
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
    rescanVideos();
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
    rescanVideos();
  }, 5000);

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "aq_pvqc_toggle") {
      active = !!e.data.enabled;
      window.__aqPvqcActive = active;
      if (active) {
        playerScanAttempts = 0;
        scanForPlayer();
      }
    }
  });

  function tryResumeOnce() {
    if (!active) return;
    document.querySelectorAll("video").forEach((v) => {
      if (!v.isConnected || v.ended) return;
      if (!v.paused) return;
      if (!v.muted) return;
      if (v.readyState < 2) return;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    });
  }

  function samplePlaybackPositions() {
    const now = performance.now();
    document.querySelectorAll("video").forEach((v) => {
      if (!v.isConnected) return;
      stuckSamples.set(v, { ct: v.currentTime, t: now });
    });
  }

  function clearWaitingTimer(v) {
    const entry = waitingTimers.get(v);
    if (!entry) return;
    clearTimeout(entry.timer);
    waitingTimers.delete(v);
    pendingWaitCount = Math.max(0, pendingWaitCount - 1);
  }

  function wireVideo(v) {
    if (wiredVideos.has(v)) return;
    wiredVideos.add(v);
    v.addEventListener(
      "waiting",
      () => {
        if (!active) return;
        clearWaitingTimer(v);
        const ct0 = v.currentTime;
        const timer = setTimeout(() => {
          if (!active || !v.isConnected || v.ended) return;
          waitingTimers.delete(v);
          pendingWaitCount = Math.max(0, pendingWaitCount - 1);
          if (Math.abs(v.currentTime - ct0) < 0.05) triggerPlayerReload();
        }, WAIT_STUCK_MS);
        waitingTimers.set(v, { timer });
        pendingWaitCount++;
      },
      true
    );
    ["playing", "canplay"].forEach((evt) => {
      v.addEventListener(evt, () => clearWaitingTimer(v), true);
    });
  }

  function rescanVideos() {
    document.querySelectorAll("video").forEach(wireVideo);
  }

  function stopFrameWatch() {
    frameWatchActive = false;
    if (frameWatchVideo && frameWatchHandle != null) {
      try {
        frameWatchVideo.cancelVideoFrameCallback(frameWatchHandle);
      } catch (e) {}
    }
    if (frameWatchTimeoutTimer) clearTimeout(frameWatchTimeoutTimer);
    frameWatchVideo = null;
    frameWatchHandle = null;
    frameWatchTimeoutTimer = null;
  }

  function onFrameTimeout() {
    if (!frameWatchActive) return;
    if (performance.now() > frameWatchEndAt) {
      stopFrameWatch();
      return;
    }
    const v = frameWatchVideo;
    if (!v || !v.isConnected || v.ended) {
      stopFrameWatch();
      return;
    }
    if (v.paused) {
      frameWatchTimeoutTimer = setTimeout(onFrameTimeout, FRAME_TIMEOUT_MS);
      return;
    }
    triggerPlayerReload();
    frameWatchTimeoutTimer = setTimeout(onFrameTimeout, FRAME_TIMEOUT_MS);
  }

  function expectFrame() {
    if (!frameWatchActive || !frameWatchVideo) return;
    frameWatchHandle = frameWatchVideo.requestVideoFrameCallback(() => {
      lastFrameAt = performance.now();
      if (frameWatchTimeoutTimer) clearTimeout(frameWatchTimeoutTimer);
      frameWatchTimeoutTimer = setTimeout(onFrameTimeout, FRAME_TIMEOUT_MS);
      expectFrame();
    });
  }

  function findVisibleSpinner() {
    for (const sel of SPINNER_SELECTORS) {
      let els;
      try {
        els = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      for (const el of els) {
        if (!el || !el.isConnected) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          lastSpinnerSelector = sel;
          return el;
        }
      }
    }
    return null;
  }

  function startSpinnerWatch() {
    if (!active) return;
    spinnerWatchEndAt = performance.now() + STUCK_WATCH_DURATION_MS;
    if (spinnerWatchTimer) return;
    spinnerVisibleSince = 0;
    spinnerWatchTimer = setInterval(() => {
      if (!active || performance.now() > spinnerWatchEndAt) {
        clearInterval(spinnerWatchTimer);
        spinnerWatchTimer = null;
        return;
      }
      const sp = findVisibleSpinner();
      if (!sp) {
        spinnerVisibleSince = 0;
        return;
      }
      if (spinnerVisibleSince === 0) {
        spinnerVisibleSince = performance.now();
        return;
      }
      if (performance.now() - spinnerVisibleSince >= SPINNER_PERSIST_MS) {
        triggerPlayerReload();
        spinnerVisibleSince = performance.now();
      }
    }, SPINNER_CHECK_INTERVAL_MS);
  }

  function startFrameWatch() {
    if (!active) return;
    frameWatchEndAt = performance.now() + STUCK_WATCH_DURATION_MS;
    if (frameWatchActive) return;
    const v = document.querySelector("video");
    if (!v || typeof v.requestVideoFrameCallback !== "function") return;
    frameWatchActive = true;
    frameWatchVideo = v;
    frameWatchTimeoutTimer = setTimeout(onFrameTimeout, FRAME_TIMEOUT_MS);
    expectFrame();
  }

  function startStuckWatch() {
    if (!active) return;
    stuckWatchEndAt = performance.now() + STUCK_WATCH_DURATION_MS;
    if (stuckWatchTimer) return;
    stuckWatchLastCt = -1;
    stuckWatchLastChange = performance.now();
    stuckWatchTimer = setInterval(() => {
      if (!active || performance.now() > stuckWatchEndAt) {
        clearInterval(stuckWatchTimer);
        stuckWatchTimer = null;
        return;
      }
      const v = document.querySelector("video");
      if (!v || !v.isConnected || v.ended || v.paused || v.readyState < 3) {
        stuckWatchLastCt = -1;
        return;
      }
      if (
        stuckWatchLastCt < 0 ||
        Math.abs(v.currentTime - stuckWatchLastCt) > 0.05
      ) {
        stuckWatchLastCt = v.currentTime;
        stuckWatchLastChange = performance.now();
        return;
      }
      if (performance.now() - stuckWatchLastChange >= STUCK_WATCH_GRACE_MS) {
        triggerPlayerReload();
        stuckWatchLastCt = -1;
        stuckWatchLastChange = performance.now();
      }
    }, STUCK_WATCH_INTERVAL_MS);
  }

  function isAnyVideoStuck() {
    const videos = document.querySelectorAll("video");
    const now = performance.now();
    for (const v of videos) {
      if (!v.isConnected || v.ended) continue;
      if (v.readyState < 3) return true;
      if (v.paused) continue;
      const prev = stuckSamples.get(v);
      if (
        prev &&
        now - prev.t >= STUCK_CT_WINDOW_MS &&
        Math.abs(v.currentTime - prev.ct) < 0.05
      ) {
        return true;
      }
    }
    return false;
  }

  function safePlayerCall(p, method) {
    if (!p || typeof p[method] !== "function") return;
    try {
      const r = p[method]();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch (e) {}
  }

  function triggerPlayerReload() {
    if (performance.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return;
    const fresh = findPlayer();
    if (fresh) wrapPlayer(fresh);
    const p = lastWrappedPlayer;
    if (!p) return;
    lastReloadAt = performance.now();
    safePlayerCall(p, "pause");
    setTimeout(() => safePlayerCall(p, "play"), RELOAD_DELAY_MS);
    setTimeout(() => {
      if (!isAnyVideoStuck()) return;
      const cur = findPlayer() || lastWrappedPlayer;
      if (!cur) return;
      if (typeof cur.stop === "function") safePlayerCall(cur, "stop");
      else safePlayerCall(cur, "load");
      setTimeout(() => safePlayerCall(cur, "play"), RELOAD_DELAY_MS);
    }, HARD_RELOAD_AFTER_MS);
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
    samplePlaybackPositions();
    tryResumeOnce();
    setTimeout(tryResumeOnce, 500);
    setTimeout(tryResumeOnce, 1500);
    setTimeout(checkStuck, STUCK_CHECK_MS);
    startStuckWatch();
    startFrameWatch();
    startSpinnerWatch();
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") resumeBgPaused();
      else stopFrameWatch();
    },
    true
  );
  window.addEventListener("focus", resumeBgPaused, true);

  window.__aqPvqcStats = function () {
    return {
      active,
      lastVisChangeAgo: lastVisChange ? performance.now() - lastVisChange : null,
      blockedCount,
      windowMs: SUPPRESS_WINDOW_MS,
      maxPerSec: MAX_BLOCKS_PER_SEC,
      lastReloadAgo: lastReloadAt ? performance.now() - lastReloadAt : null,
      hasPlayer: !!lastWrappedPlayer,
      pendingWaits: pendingWaitCount,
      videoCount: document.querySelectorAll("video").length,
      stuckWatchActive: !!stuckWatchTimer,
      stuckWatchRemainingMs: stuckWatchTimer
        ? Math.max(0, stuckWatchEndAt - performance.now())
        : 0,
      frameWatchActive,
      lastFrameAgo: lastFrameAt ? performance.now() - lastFrameAt : null,
      frameWatchSupported:
        typeof HTMLVideoElement.prototype.requestVideoFrameCallback ===
        "function",
      spinnerWatchActive: !!spinnerWatchTimer,
      spinnerVisibleForMs: spinnerVisibleSince
        ? performance.now() - spinnerVisibleSince
        : 0,
      lastSpinnerSelector,
    };
  };

  window.__aqPvqcPlayer = function () {
    const p = findPlayer();
    if (p) wrapPlayer(p);
    return lastWrappedPlayer;
  };
})();
