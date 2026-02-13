function formatBadge(quality) {
  if (!quality) return "";
  if (quality === "chunked") return "SRC";
  if (quality === "highest") return "MAX";
  const m = quality.match(/(\d{3,4})/);
  return m ? m[1] : quality.substring(0, 4).toUpperCase();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "aq_qualityUpdate" && sender.tab) {
    const text = formatBadge(msg.quality);
    const color = msg.platform === "twitch" ? "#9146FF" : "#CC0000";
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle_current_platform") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let key;
  if (tab.url.includes("twitch.tv")) key = "twitch_enabled";
  else if (tab.url.includes("youtube.com")) key = "youtube_enabled";
  else return;

  const data = await chrome.storage.local.get([key]);
  const current = data[key] !== false;
  await chrome.storage.local.set({ [key]: !current });

  if (current) {
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
  }
});
