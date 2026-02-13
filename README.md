# Auto Quality Setter — Twitch & YouTube Chrome Extension

Automatically set video quality on Twitch and YouTube. Pick your preferred resolution once — it applies on every stream, every video, every channel switch. No more manually changing quality settings.

Works with Twitch's React-based player and YouTube's built-in player API. Handles SPA navigation, fallback quality, background tab quality drops, and more.

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Auto quality on Twitch** — Source, 1440p, 1080p, 720p, 480p, 360p, 160p, or Lowest
- **Auto quality on YouTube** — 4K, 1440p, 1080p, 720p, 480p, 360p, 240p, or 144p
- **Smart fallback** — If your preferred quality isn't available, automatically goes higher or lower based on your preference
- **Prevent background quality drop** — Stops Twitch from lowering stream quality when the tab is in the background
- **Badge indicator** — Shows the currently applied quality on the extension icon
- **On-page toast notification** — Brief overlay when quality is applied, toggleable
- **Keyboard shortcut** — `Alt+Q` to toggle the extension on the current platform
- **SPA navigation support** — Re-applies quality when switching between channels or videos without page reload
- **YouTube Shorts excluded** — Only affects regular videos, not Shorts
- **Per-platform toggle** — Enable or disable Twitch and YouTube independently
- **Minimal permissions** — No data collection, no tracking, no external network requests
- **Chip-based UI** — All quality options visible at a glance, single click to select

## Installation

This extension is not published on the Chrome Web Store. To install manually:

1. Download the latest zip from [Releases](https://github.com/arasovic/twitch-yt-quality/releases/latest)
2. Extract the zip to a folder
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked**
6. Select the extracted folder
7. The extension icon appears in your toolbar — click it to configure

## Usage

1. Click the extension icon in Chrome toolbar
2. Toggle Twitch or YouTube on/off
3. Click a quality chip to select your preferred resolution
4. Choose fallback direction: **Higher** (use best available) or **Lower** (use nearest lower quality)
5. Settings apply instantly — no page refresh needed

### Keyboard Shortcut

Press `Alt+Q` on any Twitch or YouTube tab to quickly toggle the extension for that platform. Customize the shortcut at `chrome://extensions/shortcuts`.

### Toast Notifications

A small notification appears in the top-right corner of the page when quality is applied. Toggle this on/off with the **TOAST** chip in the popup header.

### Prevent Background Quality Drop (Twitch)

Twitch automatically lowers stream quality when a tab loses focus to save bandwidth. Enable **PREVENT BG CHANGE** in the Twitch section to override this behavior. The extension overrides the Page Visibility API so Twitch always thinks the tab is active. Can be toggled on/off dynamically without reloading the page.

## Supported Quality Options

### Twitch

| Chip | Resolution | Internal Value |
|------|-----------|---------------|
| SRC | Source (highest) | `chunked` |
| 1440p | 1440p60 | `1440p60` |
| 1080p | 1080p60 | `1080p60` |
| 720p | 720p (auto framerate) | `720p` |
| 480p | 480p | `480p` |
| 360p | 360p | `360p` |
| 160p | 160p | `160p` |
| LOW | Lowest available | `lowest` |

### YouTube

| Chip | Resolution | Internal Value |
|------|-----------|---------------|
| MAX | Highest available | `highest` |
| 4K | 2160p | `hd2160` |
| 1440p | 1440p | `hd1440` |
| 1080p | 1080p | `hd1080` |
| 720p | 720p | `hd720` |
| 480p | 480p | `large` |
| 360p | 360p | `medium` |
| 240p | 240p | `small` |
| 144p | 144p | `tiny` |

### Fallback Behavior

| Option | Behavior |
|--------|----------|
| **Higher** | If your selected quality isn't available, use the highest available quality |
| **Lower** | If your selected quality isn't available, use the nearest lower quality |

## How It Works

The extension uses a multi-layer messaging architecture:

1. **Inject scripts** run in the page context and access the native video player API
2. **Content scripts** bridge messages between the page and the extension
3. **Background service worker** manages the toolbar badge and keyboard shortcuts
4. **Popup** reads/writes settings via Chrome Storage API

### Twitch

Traverses React's internal fiber tree to find the player instance, then calls `player.setQuality()`. URL changes are detected via MutationObserver to handle Twitch's SPA routing.

### YouTube

Uses the `#movie_player` DOM element which exposes `setPlaybackQualityRange()` and `setPlaybackQuality()`. Navigation is detected via the `yt-navigate-finish` event.

### Extension Badge

The toolbar icon displays the currently applied quality:

| Quality | Badge |
|---------|-------|
| Source (chunked) | `SRC` |
| Highest available | `MAX` |
| 1080p60 | `1080` |
| 720p30 | `720` |
| hd1080 | `1080` |

Badge color: **purple** for Twitch, **red** for YouTube.

## Project Structure

```
twitch-yt-quality/
├── manifest.json              # Extension config (Manifest V3)
├── background.js              # Service worker — badge, keyboard shortcut
├── popup.html                 # Popup UI — chip grid, toggles
├── popup.css                  # Dark theme styling
├── popup.js                   # Settings logic, status query
├── content-twitch.js          # Twitch content script — messaging, toast, PVQC
├── content-youtube.js         # YouTube content script — messaging, toast
├── inject-twitch.js           # Twitch page script — React fiber player access
├── inject-youtube.js          # YouTube page script — player API access
├── inject-twitch-pvqc.js      # Page Visibility API override for Twitch
├── LICENSE                    # MIT License
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Architecture

```
┌────────────────┐               ┌─────────────────────┐               ┌───────────────────┐
│  inject-*.js   │──postMessage─→│  content-*.js       │──runtime.msg─→│  background.js    │
│  (page ctx)    │←──────────────│  (isolated world)   │               │  (svc worker)     │
│                │               │                     │               │                   │
│  player API    │               │  toast, messaging   │               │  badge, shortcut  │
└────────────────┘               └─────────────────────┘               └───────────────────┘
                                           ↑                                     ↑
                                           │                                     │
                                    ┌──────┴──────┐                              │
                                    │  popup.js   │── storage.onChanged ─────────┘
                                    │  (settings) │
                                    └─────────────┘
```

## Why This Exists

Most Twitch and YouTube quality extensions are bloated with unnecessary features, broken on recent player updates, or paywalled. This is a minimal, open-source alternative that does one thing — automatically set video quality — with zero bloat, zero data collection, and zero external requests.

## FAQ

### Does this work on Firefox?
Not yet. The extension uses Chrome Manifest V3 APIs. Firefox support may be added in the future.

### Does this work on YouTube Shorts?
No. YouTube Shorts are intentionally excluded since they use a different player.

### Why does Twitch lower quality when I switch tabs?
Twitch uses the Page Visibility API to detect when a tab is in the background and automatically reduces stream quality to save bandwidth. The **PREVENT BG CHANGE** feature overrides this.

### Can I set different qualities for different Twitch channels?
Not currently. The quality setting applies globally to all Twitch streams.

## License

[MIT](LICENSE)
