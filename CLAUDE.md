# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Chrome extension (Manifest V3) that extracts audio from Bilibili videos and plays it in a standalone popup window. Built with TypeScript + Webpack. No React framework used in the extension UI — vanilla TS with direct DOM manipulation.

## Commands

```bash
npm run build   # Production build → dist/
npm run dev     # Watch mode for development
```

To load the extension: open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", select the `dist/` directory.

## Architecture

Webpack compiles five independent entry points, each mapped to a Chrome extension page:

| Entry (`src/`) | Output | Purpose |
|---|---|---|
| `background.ts` | `background.js` | Service worker — handles messages, opens player windows, manages context menus |
| `contentScript.ts` | `contentScript.js` | Injected into bilibili.com pages — renders the floating "提取音频" button |
| `popup.ts` | `popup.js` | Extension toolbar popup — detect current tab, manual URL input, play history |
| `player.ts` | `player.js` | Standalone audio player window — playback controls, add-to-playlist |
| `settings.ts` | `settings.js` | Options page — privacy notice, playlist CRUD, history management |

Static HTML files in `public/` are copied verbatim to `dist/` alongside the compiled JS.

## Key Design Decisions

**On-demand audio URL fetching**: Bilibili audio URLs expire quickly. The player always re-fetches a fresh URL from the API before playback rather than relying on a stored URL. `bvid` + `cid` are stored persistently; `audioUrl` is ephemeral. `ViewApiResponseData.pages` is normalized into `BilibiliPageInfo[]`; URL `?p=` and explicit CID selection both resolve to the exact part before requesting its audio stream.

**WBI signature (`encWbi` in `src/utils/util.ts`)**: All Bilibili API calls must be signed using the WBI scheme. Sign keys (`imgKey`, `subKey`) are fetched from `/x/web-interface/nav` and cached in `chrome.storage.local` for 24 hours. `initSignData()` in `bilibiliApi.ts` manages this cache.

**Message passing**: `popup.ts` and `player.ts` cannot call Bilibili APIs directly (CORS). They send `getBilibiliAudio` messages to the background service worker, which performs the fetch and replies.

**Transient allowlisted cookies**: Bilibili's anti-bot measures require more than just SESSDATA. Only the background worker reads the explicit allowlist in `AUTH_COOKIE_NAMES`, uses it for fixed `api.bilibili.com` GET requests, and discards it afterward. Cookie values are never returned through messaging or persisted. Legacy `authConfig` sync data is removed on extension update/startup.

**CDN Referer fix**: The `<audio>` element in a `chrome-extension://` page sends a non-bilibili Referer, causing CDN 403s. A `declarativeNetRequest` dynamic rule rewrites the `Referer` and `Origin` headers only for media requests to `*.bilivideo.com` and `*.bilivideo.cn` initiated by this extension.

**fnval for audio quality**: Use `fnval=4048` (not `16`) to request DASH + FLAC + Dolby streams. Audio selection priority: standard `dash.audio` (highest bandwidth, better Chrome compatibility) → `dolby.audio` fallback → `durl` fallback. Collect primary + backup CDN URLs (`baseUrl`/`backupUrl`) so the player can fail over without re-fetching immediately.

**Autoplay policy**: New popup windows have no user-interaction history; `play()` is blocked by Chrome. Workaround: set `audioPlayer.muted = true` before `play()`, then unmute in the `.then()` callback.

**Storage**:
- `chrome.storage.local` — WBI sign keys cache (`signData`, `spiData`, `cacheTime`), play history, per-part resume positions (`playbackProgress`), playback rate, and user playlists (`userPlaylists`)

Both storage areas are restricted to trusted extension contexts; the Bilibili content script cannot read them.

**Permissions** (manifest.json):
- `cookies` — needed for background-only, allowlisted `chrome.cookies.get` calls
- `declarativeNetRequest` — needed for the CDN Referer rule
- `host_permissions` includes HTTPS-only Bilibili API and CDN domains

## Utility Modules (`src/utils/`)

- `types.ts` — All shared TypeScript interfaces (`BilibiliVideoInfo`, `AuthConfig`, `HistoryItem`, API response shapes)
- `playlistTypes.ts` — `Playlist` and `PlaylistItem` interfaces; playlists stored under key `userPlaylists`
- `bilibiliApi.ts` — API calls: `getBilibiliAudio`, `fetchVideoInfo`, `extractAudioUrl`, `initSignData`, `sign`
- `runtimeApi.ts` — typed message helper for background-only API access
- `util.ts` — `encWbi` (WBI signing), `extractVideoId` (accepts full URL **or** bare `BV1xxx`/`av123`), `isBilibiliVideoPage`

## Pitfalls (Do Not Repeat)

Lessons from real bugs in this project. Prefer these rules over inventing a “simpler” path.

### Playback reliability (`src/player.ts`, `src/utils/bilibiliApi.ts`)

- **Never rely on a single CDN URL.** Bilibili returns `baseUrl`/`base_url` plus `backupUrl`/`backup_url`. Collect an ordered candidate list (`audioUrls`) and fail over before re-fetching.
- **Do not prefer Dolby first in Chrome.** Standard `dash.audio` is more compatible; keep Dolby only as fallback after DASH.
- **Cap recovery.** Try candidates in order, then at most **one** full re-fetch of playurl. Infinite retry loops surface as intermittent “播放失败，请稍后重试”.
- **Track generations, not just flags.** When switching tracks / parts / playlist items, bump `playerGeneration` and `audioRequestId`. Ignore stale `play()`, `onerror`, recovery, and in-flight `requestBilibiliAudio` results that no longer match.
- **Respect user intent.** Set `playbackWanted = false` on pause / ended / autoplay-blocked. Recovery must not restart audio the user already stopped.
- **Re-check generation after every `await`.** Classic race: `await checkIfVideoIsFavorited(...)` then assign `audioPlayer.onerror` / call `play()` for an old track and overwrite the new track’s handlers.

### Floating UI (episode picker in `public/player.html` + `src/player.ts`)

- **Ancestor `overflow` clips overlays.** `.player-container { overflow-y: auto }` will clip `position: absolute` menus. For a real float: move the panel to `document.body` and use `position: fixed` with coordinates from `getBoundingClientRect()`.
- **Do not style open-state via a parent selector after portaling.** `.episode-control.is-open .episode-panel` stops matching once the panel is under `body`. Toggle an open class (or `[hidden]`) **on the panel itself**. Symptom: click “选集” appears to do nothing because the list stays `display: none`.
- **Outside-click handlers must treat the portaled panel as inside.** Check both the trigger and `episodePanel.contains(target)`. Prefer `stopPropagation` on toggle/item clicks.
- **Reposition on `resize` and capture-phase `scroll`.** Fixed coords go stale when the player container scrolls.

### Versioning / release

- **Keep these three in lockstep:** `package.json` `version`, `public/manifest.json` `version`, and the popup footer in `public/popup.html` (`#version`). Release workflow rejects tag vs package/manifest mismatch; the footer is easy to leave at an old value (e.g. `v1.0.0` while package is `1.2.x`).
- **Release is tag-driven:** push `vX.Y.Z` after versions match; `.github/workflows/release.yml` builds and publishes the zip.

### Git push from this environment

- **Do not use HTTPS `origin` here.** It fails non-interactively with:
  `fatal: could not read Username for 'https://github.com': No such device or address`
- **Use SSH remote instead:**
  `git remote set-url origin git@github.com:cdcvip/bilibili-audio-player.git`
  then `git push origin main` / `git push origin vX.Y.Z`.
- SSH key auth is already set up for `cdcvip`. Prefer `origin` after the URL fix; do not keep one-off `git push git@github.com:...` workarounds that leave tracking refs stale.
- Network/DNS may still require elevated permissions in sandboxed agent runs.
