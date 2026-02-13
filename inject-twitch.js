(function () {
  let attempts = 0;
  const MAX_ATTEMPTS = 20;

  function reportQuality(group) {
    window.postMessage({ type: "aq_twitchQualityApplied", quality: group }, "*");
  }

  function parseResolution(group) {
    if (group === "chunked") return 99999;
    if (group === "lowest") return 0;
    const m = group.match(/(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }

  function findPlayer() {
    const fibers = [];
    document.querySelectorAll("div,section,main").forEach((el) => {
      for (const key in el) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")) {
          fibers.push(el[key]);
        }
      }
    });

    for (const fiber of fibers) {
      let node = fiber;
      while (node) {
        const props = node.pendingProps || node.memoizedProps;
        if (props) {
          if (props.mediaPlayerInstance) return props.mediaPlayerInstance;
          if (props.player) return props.player;
        }
        node = node.return;
      }
    }
    return null;
  }

  function applyQuality(player, quality, fallback) {
    const available = player.getQualities();
    if (!available || !available.length) return false;

    const current = player.getQuality();
    if (!current) return false;

    function setQ(q) {
      setTimeout(() => player.setQuality(q), 150);
      reportQuality(q.group);
      return true;
    }

    if (quality === "chunked") {
      const highest = available[0];
      if (highest.group === current.group) {
        reportQuality(current.group);
        return true;
      }
      return setQ(highest);
    }

    if (quality === "lowest") {
      const lowest = available[available.length - 1];
      if (lowest.group === current.group) {
        reportQuality(current.group);
        return true;
      }
      return setQ(lowest);
    }

    if (quality === current.group || current.group.startsWith(quality)) {
      reportQuality(current.group);
      return true;
    }

    let match = available.find((q) => q.group === quality);
    if (!match) {
      match = available.find((q) => q.group.startsWith(quality));
    }
    if (!match) {
      match = available.find(
        (q) => q.name && q.name.replace(/\s*\(.*?\)\s*$/, "") === quality
      );
    }

    if (match) {
      if (match.group === current.group) {
        reportQuality(current.group);
        return true;
      }
      return setQ(match);
    }

    if (!fallback) {
      reportQuality(current.group);
      return true;
    }

    if (fallback === "higher" || fallback === "chunked" || fallback === "highest") {
      const highest = available[0];
      if (highest.group === current.group) {
        reportQuality(current.group);
        return true;
      }
      return setQ(highest);
    }

    if (fallback === "lower" || fallback === "lowest") {
      const targetRes = parseResolution(quality);
      const lower = available.find(
        (q) => parseResolution(q.group) < targetRes
      );
      if (lower) {
        if (lower.group === current.group) {
          reportQuality(current.group);
          return true;
        }
        return setQ(lower);
      }
      const lowest = available[available.length - 1];
      if (lowest.group === current.group) {
        reportQuality(current.group);
        return true;
      }
      return setQ(lowest);
    }

    reportQuality(current.group);
    return true;
  }

  function initWithRetry(quality, fallback) {
    const player = findPlayer();
    if (player && applyQuality(player, quality, fallback)) return;
    attempts++;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(() => initWithRetry(quality, fallback), 1000);
    }
  }

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "aq_setTwitchQuality") {
      attempts = 0;
      initWithRetry(e.data.quality, e.data.fallback);
    }
  });
})();
