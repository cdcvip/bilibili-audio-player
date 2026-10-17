# Changelog

All notable changes to this project will be documented in this file.

## [1.2.2] - 2026-10-17

### Added
- Bounded automatic playback recovery: after a failure the player retries on its own with 2s/5s/10s backoff (at most 3 attempts) and recovers immediately when the network comes back.
- Stall watchdog for streams that die without firing a media `error` (expired CDN URL, dropped connection), which previously left the player frozen with no message.
- In-page status feedback for the floating 提取音频 button: loading, success, and failure messages replace the blocking `alert()`.
- Automatic re-injection of the content script after an extension install/update/startup, so the floating button keeps working in tabs that were already open.

### Fixed
- Playback could not recover after a transient failure: the capped recovery budget was never reset, so clicking play re-ran the exhausted loop without re-fetching the playurl and re-showed the same error indefinitely. Recovery now resumes where playback actually stopped instead of restarting from the beginning.
- The in-page 提取音频 button appeared to do nothing when the background rejected a message, because `openPlayer` was dropped silently. The background now always answers and the page surfaces the reason.
- Confirming the playlist picker without selecting a collection closed the dialog silently, which looked like the favorite button doing nothing.
- A player status message could be wiped early by the previous message's auto-hide timer.

### Changed
- Added the `scripting` permission (no user-facing permission warning) to support content script re-injection.

## [1.2.1] - 2026-07-18

### Added
- Collapsible floating multi-part episode picker with full titles and current-episode highlight.

### Fixed
- Intermittent audio playback failures by collecting primary/backup CDN URLs, preferring standard DASH over Dolby, and recovering with candidate failover plus one re-fetch.
- Stale playback recovery races when switching tracks or reusing the player window.
- Popup footer version display left at an outdated value.

## [1.2.0] - 2026-07-15

### Added
- Persistent per-part playback progress with automatic resume and cleanup after completion.
- Automatic creation of a "默认合集" playlist when favoriting without an existing playlist.
- Tag-triggered GitHub Release workflow with version validation, ZIP packaging, generated notes, and SHA-256 checksum.

### Changed
- Refined the compact player layout with clearer information, transport, speed, timeline, and volume sections.

## [1.1.0] - 2026-07-15

### Added
- Multi-part video selection with exact `?p=`/CID playback, previous/next part controls, and automatic continuation.
- Persistent 0.25×–3× playback speed with common presets and ±0.05× fine adjustment.
- Previous/next track controls for playlists, ±10-second seeking, and Spacebar play/pause.

### Changed
- Replaced duplicate native audio controls with a single custom timeline and transport control layout.
- Restricted Bilibili cookie access to an explicit background-only allowlist and removed manual/synced `SESSDATA` storage.
- Hardened runtime message validation, extension storage access, CSP, permissions, and CDN header rules.
- Updated and reduced the dependency tree, switched the lock file to the official npm registry, and pinned CI actions by commit SHA.

### Fixed
- Playback history and playlists now distinguish video parts by BVID and CID.
- Existing player windows are reused even when their URL contains selected-part parameters.
- Removed known npm dependency vulnerabilities reported by the official audit database.

## [1.0.0] - 2024-07-30

### Added
- **Playlist Management**: Users can now manually add Bilibili video URLs to a specific playlist directly from the settings page. This involves URL validation and fetching video metadata before adding.
- **Player Window Reuse**: The extension now intelligently reuses an existing player window if one is already open, focusing it and sending new audio data instead of opening multiple player instances. The active player window ID is tracked in local storage.
- **Custom In-Player Modals**: Replaced native browser `prompt()` and `confirm()` dialogs within the player (e.g., for adding to playlists, confirming removal) with custom HTML/CSS/JS modals. This resolves issues with dialogs being suppressed by the browser when the player window isn't active.

### Changed
- **Robust Audio URL Handling**:
    - Playback history and playlist items now primarily store Bilibili Video IDs (BVID) and Content IDs (CID) instead of potentially expiring full audio URLs.
    - Audio URLs are fetched on-demand from the Bilibili API using the stored BVID/CID right before playback is initiated. This significantly improves the reliability of playing from history and playlists over time.
    - This change was implemented across the popup, player, and settings scripts, with API calls routed through the background script.
- **Centralized Type Definitions**: Shared TypeScript interfaces (like `BilibiliVideoInfo`, `HistoryItem`, `AuthConfig`) have been consolidated into a new `src/utils/types.ts` file and imported across relevant modules (`popup.ts`, `player.ts`, `settings.ts`, `utils/bilibiliApi.ts`) to improve code maintainability and type safety.

### Fixed
- **Expired Audio URLs**: Resolved a critical issue where audio playback from history or playlists would fail after the initially extracted audio URL (with a `deadline` parameter) expired.
- **Suppressed Player Dialogs**: Fixed an issue where `window.prompt()` or `window.confirm()` calls in the player window could be suppressed by the browser if the player tab was not the active, focused tab.
- **Linter Errors**: Addressed various linter errors that arose during refactoring, including duplicate imports and incorrect type usages.

---
*Older changes before this log was started are not detailed here.*
