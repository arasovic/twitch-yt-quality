let scriptReady = false;
let pvqcInjected = false;
let lastAppliedQuality = null;

function injectScript(callback) {
  if (document.querySelector("script[data-aq-twitch]")) {
    callback && callback();
    return;
  }
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject-twitch.js");
  s.dataset.aqTwitch = "1";
  s.onload = () => {
    scriptReady = true;
    callback && callback();
  };
  (document.head || document.documentElement).appendChild(s);
}

function injectPvqc() {
  if (pvqcInjected) return;
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject-twitch-pvqc.js");
  s.dataset.aqPvqc = "1";
  s.onload = () => {
    pvqcInjected = true;
  };
  (document.head || document.documentElement).appendChild(s);
}

function togglePvqc(enabled) {
  if (enabled && !pvqcInjected) {
    injectPvqc();
    return;
  }
  window.postMessage({ type: "aq_pvqc_toggle", enabled }, "*");
}

function sendQuality() {
  chrome.storage.local.get(
    ["twitch_enabled", "twitch_quality", "twitch_fallback"],
    (data) => {
      if (data.twitch_enabled === false) return;
      const msg = {
        type: "aq_setTwitchQuality",
        quality: data.twitch_quality || "chunked",
        fallback: data.twitch_fallback || "chunked",
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
      "position:fixed;top:20px;right:20px;z-index:9999;background:#1a1a2e;border:1px solid #9146FF;color:#e0e0e4;font-family:monospace;font-size:12px;padding:8px 14px;border-radius:6px;opacity:0;transition:opacity 0.3s;pointer-events:none;";
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
  if (e.data && e.data.type === "aq_twitchQualityApplied") {
    lastAppliedQuality = e.data.quality;
    try {
      chrome.runtime.sendMessage({
        type: "aq_qualityUpdate",
        platform: "twitch",
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

chrome.storage.local.get(["twitch_prevent_bg_change"], (data) => {
  if (data.twitch_prevent_bg_change !== false) injectPvqc();
});

let lastUrl = location.href;
let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(sendQuality, 1500);
    }
  }, 200);
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.storage.onChanged.addListener((changes) => {
  if (
    changes.twitch_enabled ||
    changes.twitch_quality ||
    changes.twitch_fallback
  ) {
    sendQuality();
  }
  if (changes.twitch_prevent_bg_change) {
    togglePvqc(changes.twitch_prevent_bg_change.newValue !== false);
  }
});
