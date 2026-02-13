const DEFAULTS = {
  twitch_enabled: true,
  twitch_quality: "1080p60",
  twitch_fallback: "higher",
  youtube_enabled: true,
  youtube_quality: "hd1080",
  youtube_fallback: "higher",
  show_toast: true,
  twitch_prevent_bg_change: true,
};

const els = {
  twitchToggle: document.getElementById("twitch-toggle"),
  twitchFields: document.getElementById("twitch-fields"),
  twitchStatus: document.getElementById("twitch-status"),
  twitchPvqc: document.getElementById("twitch-pvqc"),
  youtubeToggle: document.getElementById("youtube-toggle"),
  youtubeFields: document.getElementById("youtube-fields"),
  youtubeStatus: document.getElementById("youtube-status"),
  toastToggle: document.getElementById("toast-toggle"),
  toast: document.getElementById("toast"),
};

let toastTimer;

function showToast() {
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1200);
}

function save(key, value) {
  chrome.storage.local.set({ [key]: value }, showToast);
}

function updateFieldState(platform) {
  const enabled = els[platform + "Toggle"].checked;
  els[platform + "Fields"].classList.toggle("disabled", !enabled);
  if (!enabled) {
    document.getElementById(platform + "-status").textContent = "Disabled";
  }
}

function setChipSelection(gridId, value) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.querySelectorAll(".quality-chip").forEach((c) => {
    c.classList.toggle("selected", c.dataset.value === value);
  });
}

function setFbSelection(rowId, value) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelectorAll(".fb-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.value === value);
  });
}

function queryStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || "";
    const tabId = tabs[0].id;

    let platform = null;
    if (url.includes("twitch.tv")) platform = "twitch";
    else if (url.includes("youtube.com")) platform = "youtube";
    if (!platform) return;

    chrome.tabs.sendMessage(tabId, { type: "aq_getStatus" }, (response) => {
      if (chrome.runtime.lastError) return;
      const el = document.getElementById(platform + "-status");
      if (response && response.quality) {
        el.textContent = "Applied: " + response.quality;
      } else {
        el.textContent = "Waiting...";
      }
    });
  });
}

chrome.storage.local.get(DEFAULTS, (data) => {
  els.twitchToggle.checked = data.twitch_enabled;
  els.youtubeToggle.checked = data.youtube_enabled;
  els.twitchPvqc.checked = data.twitch_prevent_bg_change;
  els.toastToggle.checked = data.show_toast;
  setChipSelection("twitch-quality-grid", data.twitch_quality);
  setFbSelection("twitch-fallback-row", data.twitch_fallback);
  setChipSelection("youtube-quality-grid", data.youtube_quality);
  setFbSelection("youtube-fallback-row", data.youtube_fallback);
  updateFieldState("twitch");
  updateFieldState("youtube");
});

document.querySelectorAll(".chip-grid").forEach((grid) => {
  grid.addEventListener("click", (e) => {
    const chip = e.target.closest(".quality-chip");
    if (!chip) return;
    grid
      .querySelectorAll(".quality-chip")
      .forEach((c) => c.classList.remove("selected"));
    chip.classList.add("selected");
    save(grid.dataset.key, chip.dataset.value);
  });
});

document.querySelectorAll(".fallback-row").forEach((row) => {
  row.addEventListener("click", (e) => {
    const btn = e.target.closest(".fb-btn");
    if (!btn) return;
    row.querySelectorAll(".fb-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    save(row.dataset.key, btn.dataset.value);
  });
});

els.twitchToggle.addEventListener("change", () => {
  save("twitch_enabled", els.twitchToggle.checked);
  updateFieldState("twitch");
});

els.youtubeToggle.addEventListener("change", () => {
  save("youtube_enabled", els.youtubeToggle.checked);
  updateFieldState("youtube");
});

els.twitchPvqc.addEventListener("change", () => {
  save("twitch_prevent_bg_change", els.twitchPvqc.checked);
});

els.toastToggle.addEventListener("change", () => {
  save("show_toast", els.toastToggle.checked);
});

queryStatus();
