(function () {
  let attempts = 0;
  const MAX_ATTEMPTS = 15;
  const QUALITY_ORDER = [
    "highres",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny",
  ];

  function reportQuality(quality) {
    window.postMessage(
      { type: "aq_youtubeQualityApplied", quality: quality },
      "*"
    );
  }

  function applyQuality(player, quality, fallback) {
    const available = player.getAvailableQualityLevels();
    if (!available || !available.length) return;

    function setQ(q) {
      setTimeout(() => {
        player.setPlaybackQualityRange(q);
        player.setPlaybackQuality(q);
      }, 150);
      reportQuality(q);
    }

    if (quality === "highest") {
      setQ(available[0]);
      return;
    }

    if (available.includes(quality)) {
      setQ(quality);
      return;
    }

    if (fallback === "higher" || fallback === "highest") {
      setQ(available[0]);
      return;
    }

    if (fallback === "lower") {
      const targetIdx = QUALITY_ORDER.indexOf(quality);
      if (targetIdx !== -1) {
        for (let i = targetIdx + 1; i < QUALITY_ORDER.length; i++) {
          if (available.includes(QUALITY_ORDER[i])) {
            setQ(QUALITY_ORDER[i]);
            return;
          }
        }
      }
      setQ(available[available.length - 1]);
      return;
    }

    if (fallback && available.includes(fallback)) {
      setQ(fallback);
      return;
    }

    const current = player.getPlaybackQuality();
    if (current) reportQuality(current);
  }

  function tryApply(quality, fallback) {
    const player = document.querySelector("#movie_player");
    if (player && typeof player.getAvailableQualityLevels === "function") {
      applyQuality(player, quality, fallback);
      return true;
    }
    return false;
  }

  function initWithRetry(quality, fallback) {
    if (tryApply(quality, fallback)) return;
    attempts++;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(() => initWithRetry(quality, fallback), 1000);
    }
  }

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "aq_setYouTubeQuality") {
      attempts = 0;
      initWithRetry(e.data.quality, e.data.fallback);
    }
  });
})();
