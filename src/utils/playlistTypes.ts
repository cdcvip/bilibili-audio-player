// src/utils/playlistTypes.ts

/**
 * Represents a single video item within a playlist.
 */
export interface PlaylistItem {
  id: string;          // Unique ID for the playlist item (e.g., UUID or timestamp-based)
  title: string;
  bvid: string;       // Bilibili Video ID (should be primary identifier)
  cid: string;         // Bilibili Content ID (for multi-part videos)
  audioUrl?: string;   // Legacy-only field; new writes omit temporary CDN URLs
  addedAt: string;     // ISO date string, when the item was added to this playlist
}

/**
 * Represents a user-created playlist.
 */
export interface Playlist {
  id: string;          // Unique ID for the playlist (e.g., UUID)
  name: string;        // User-defined name for the playlist
  items: PlaylistItem[]; // Array of video items in the playlist
  createdAt: string;   // ISO date string, when the playlist was created
  updatedAt: string;   // ISO date string, when the playlist was last modified (e.g., item added/removed, renamed)
}

// The main storage key for all playlists will be 'userPlaylists'.
// The data stored under this key will be an array of Playlist objects: Playlist[]
