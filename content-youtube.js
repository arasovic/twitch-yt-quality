let scriptReady = false;
let lastAppliedQuality = null;

function isShorts() {
  return location.pathname.startsWith("/shorts/");
}

function injectScript(callback) {
  if (document.querySelector("script[data-aq-youtube]")) {
    callback && callback();
    return;
  }
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject-youtube.js");
  s.dataset.aqYoutube = "1";
  s.onload = () => {
    scriptReady = true;
    callback && callback();
  };
  (document.head || document.documentElement).appendChild(s);
}

function sendQuality() {
  if (isShorts()) return;
  chrome.storage.local.get(
    ["youtube_enabled", "youtube_quality", "youtube_fallback"],
    (data) => {
      if (data.youtube_enabled === false) return;
      const msg = {
        type: "aq_setYouTubeQuality",
        quality: data.youtube_quality || "hd1080",
        fallback: data.youtube_fallback || "highest",
      };
      if (!scriptReady) {
        injectScript(() => window.postMessage(msg, "*"));
        return;
      }
      window.postMessage(msg, "*");
    }
  );
}

function showToast(quality) {
  chrome.storage.local.get(["show_toast"], (data) => {
    if (data.show_toast === false) return;
    const existing = document.getElementById("aq-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "aq-toast";
    toast.style.cssText =
      "position:fixed;top:20px;right:20px;z-index:9999;background:#1a1a2e;border:1px solid #CC0000;color:#e0e0e4;font-family:monospace;font-size:12px;padding:8px 14px;border-radius:6px;opacity:0;transition:opacity 0.3s;pointer-events:none;";
    toast.textContent = "AQ: " + quality;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  });
}

window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "aq_youtubeQualityApplied") {
    lastAppliedQuality = e.data.quality;
    try {
      chrome.runtime.sendMessage({
        type: "aq_qualityUpdate",
        platform: "youtube",
        quality: e.data.quality,
      });
    } catch (err) {}
    showToast(e.data.quality);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "aq_getStatus") {
    sendResponse({ quality: lastAppliedQuality });
    return true;
  }
  if (msg.type === "aq_applyNow") {
    sendQuality();
    sendResponse({ ok: true });
    return true;
  }
});

injectScript(() => sendQuality());

document.addEventListener("yt-navigate-finish", () => {
  setTimeout(sendQuality, 1000);
});

chrome.storage.onChanged.addListener((changes) => {
  if (
    changes.youtube_enabled ||
    changes.youtube_quality ||
    changes.youtube_fallback
  ) {
    sendQuality();
  }
});
