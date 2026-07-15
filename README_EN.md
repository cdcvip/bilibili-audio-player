Read this in: [中文](README.md) | [English](README_EN.md)

# Bilibili Audio Player Chrome Extension - User Guide

## Features

Bilibili Audio Player is a Chrome extension that extracts audio from Bilibili videos and plays it independently. Key features include:

1. Extracts audio from Bilibili video URLs **or bare BV IDs** (e.g. `BV1xx411c7mD`), using an on-demand fetching mechanism to prevent expired links.
2. Plays audio independently; closing the Bilibili video page does not affect audio playback.
3. **Player Window Reuse**: Prefers to use an already open player window, avoiding duplicate windows.
4. Reads an allowlisted set of required Bilibili cookies transiently in the background only when extracting audio; login credentials are never stored or synced.
5. Automatically detects if the current page is a Bilibili video page.
6. Provides a floating button, popup window, and a standalone player window.
7. **Playback History:** Automatically records recently played audio (stored by video ID for persistence). View and replay your listening history in the extension popup, with support for viewing full history and clearing it on the settings page.
8. **Custom Playlists:** Create and manage your own audio collections.
    * Create, rename, and delete playlists on the settings page.
    * **Manually add videos to a specific playlist by pasting a Bilibili video URL on the settings page**.
    * Add the currently playing audio to a playlist directly from the player.
    * View playlist contents and play audio from them on the settings page.
9. **Multi-part selection:** Detects all video parts, respects `?p=` URLs, supports in-player switching, and automatically continues to the next part.
10. **Playback speed:** Supports 0.25×–3× speed, ±0.05× fine adjustments, and remembers the last selection.

## Installation

### Developer Mode Installation

1. Clone or download this project and run `npm run build` to generate the `dist/` directory.
2. Open Chrome browser and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked".
5. Select the project's `dist/` directory.

### Installation from Chrome Web Store (Not yet published)

Not yet listed on the Chrome Web Store. Please use Developer Mode installation.

## How to Use

### Method 1: On a Bilibili Video Page

1. Visit any Bilibili video page.
2. Click the "Extract Audio" floating button that appears in the bottom right corner of the page.
3. The audio will open in a new window and start playing automatically.

### Method 2: Using the Extension Icon

1. Click the extension icon in the Chrome toolbar.
2. If the current page is a Bilibili video page, it will display video information and a "Play this video's audio" button.
3. Alternatively, enter a Bilibili video URL **or a bare BV ID** (e.g. `BV1xx411c7mD`) and click "Extract and Play Audio".

### Login-only videos

Videos that require authentication use the Bilibili login state in the current browser. The extension never asks you to copy `SESSDATA` and never writes login cookies to extension storage; sign in directly on the Bilibili website.

## Player Controls

The player window offers the following controls:
- Play/Pause
- Spacebar Play/Pause
- Previous/next part (or previous/next track in playlist mode)
- Skip backward/forward 10 seconds
- Seekable progress bar
- Volume adjustment
- Multi-part episode selection
- 0.25×–3× playback speed with ±0.05× fine adjustment
- Add to Playlist button (add the current audio to one of your custom playlists)
- Settings button (quick access to the settings page)

## Troubleshooting

- Some videos require a Bilibili login to extract audio — make sure you are logged in to Bilibili in your browser.
- If audio fails to load, try refreshing the page or re-logging in to Bilibili.
- This extension is for personal study and use only. Please respect Bilibili's copyright and terms of use.
