# Auto Quality Setter — Twitch & YouTube Chrome Extension

Automatically set video quality on Twitch and YouTube. Pick your preferred resolution once — it applies on every stream, every video, every channel switch. No more manually changing quality settings.

Works with Twitch's React-based player and YouTube's built-in player API. Handles SPA navigation, fallback quality, background tab interruptions, and more.

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Auto quality on Twitch** — Source, 1440p, 1080p, 720p, 480p, 360p, 160p, or Lowest
- **Auto quality on YouTube** — 4K, 1440p, 1080p, 720p, 480p, 360p, 240p, or 144p
- **Smart fallback** — If your preferred quality isn't available, automatically goes higher or lower based on your preference
- **Prevent background interruption** — Auto-resumes muted Twitch streams that pause when switching macOS Spaces or browser windows
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

### Prevent Background Interruption (Twitch)

When a Twitch stream is muted and the browser window loses focus (e.g., switching macOS Spaces), Chromium pauses the video to save resources. On longer backgrounds (multi-minute), the HLS source pipeline goes dormant — even if the video element is told to play again, segment fetching never restarts, leaving the player stuck on a loading spinner. Twitch's player UI can also leave the loading-spinner overlay visible after focus return even when the video is actually playing. Enable **PREVENT BG CHANGE** in the Twitch section to handle all of these: pauses are suppressed within a 500ms visibility-change window, any pauses that slip through are auto-resumed on focus return, and a 30-second watchdog after focus return looks for stuck playback (`currentTime` not advancing, no frames painting, or a Twitch loading-spinner overlay persisting ≥ 5 seconds) and reloads the player when it sees one. The reload escalates: a soft `pause` → `play` sequence first, and if playback still hasn't resumed 1.5 seconds later, a harder `stop` (or `load`) → `play` cycle that fully resets the source pipeline. Can be toggled on/off dynamically without reloading the page.

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

### Twitch Background Interruption (PVQC)

Chromium browsers pause muted background media; on multi-minute backgrounds, the HLS source pipeline goes dormant and `play()` alone does not restart segment fetching. Beyond that, Twitch's player UI sometimes leaves a loading-spinner overlay visible even when the underlying `<video>` is healthy. PVQC handles these in three layers, with five detection signals feeding the recovery layer:

1. **Pause suppression** — overrides `HTMLMediaElement.prototype.pause` to block pause calls within 500ms of a `visibilitychange`/`blur`/`freeze` event (capped at 3 blocks/sec to avoid retry loops). The Amazon IVS Player's `pause`/`stop`/`onIdle` methods are also wrapped via React fiber traversal as defensive depth.
2. **Auto-resume** — on `visibilitychange-visible` or window `focus`, every connected `<video>` that is muted, paused, and has `readyState ≥ 2` gets force-played, with retries at 0ms / 500ms / 1500ms in case the Twitch worker re-pauses.
3. **Stuck-source / stuck-UI recovery** — five orthogonal detectors run on focus return; any one can trigger the same reload chain:
   - **Focus baseline** — at focus, `currentTime` is sampled per video; 2.5s later, a video is "stuck" if `readyState < 3` or `currentTime` hasn't advanced past the baseline within a 1.5s window.
   - **`<video>.waiting` event** — if a video fires `waiting` and `currentTime` doesn't move within 2s, treat as stuck.
   - **`currentTime` watchdog** — 30s, polled at 1Hz; if a non-paused video with `readyState ≥ 3` keeps the same `currentTime` for ≥ 1.5s, treat as stuck.
   - **`requestVideoFrameCallback` watchdog** — 30s; if no frame is delivered to the compositor within 2.5s while the video is unpaused, treat as stuck (catches decoder pipeline halts).
   - **DOM spinner watchdog** — 30s, polled at 1Hz; if a known Twitch loading-spinner element is visibly mounted for ≥ 5s, treat as stuck (catches the case where the video is fine but the UI overlay never clears).

   Recovery escalates: first a soft reload via `player.pause()` → 200ms → `player.play()` (the same sequence Twitch's UI runs when a user clicks pause/play), then 1.5 seconds later, if still stuck, a hard reload via `player.stop()` (or `player.load()` as fallback) → 200ms → `player.play()` to fully reset the source pipeline. Before each reload, a fresh `findPlayer()` is run to guard against stale player references after React remounts. A 5-second cooldown prevents reload spam on rapid space switches.

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
├── inject-twitch-pvqc.js      # Pause override + auto-resume for Twitch background
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

### Why does Twitch pause when I switch macOS Spaces while muted?
Chromium browsers throttle muted background media by triggering a pause on the underlying video element. With audio playing, browsers leave the stream alone — but muted streams get paused, requiring a manual click to resume. After long backgrounds (multi-minute), Twitch's HLS source pipeline also goes dormant, so even calling `play()` won't restart playback. The **PREVENT BG CHANGE** feature blocks pause calls within a 500ms visibility-change window, auto-resumes on focus return, and if the source is still stuck 2.5 seconds later (either `readyState < 3` or `currentTime` not advancing), reloads the player automatically — first with a soft `pause`→`play`, then a harder `stop`/`load`→`play` if playback still hasn't resumed 1.5 seconds after the soft attempt.

### Can I set different qualities for different Twitch channels?
Not currently. The quality setting applies globally to all Twitch streams.

## License

[MIT](LICENSE)
