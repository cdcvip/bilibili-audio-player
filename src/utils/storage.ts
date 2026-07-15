import { Playlist, PlaylistItem } from './playlistTypes';
import { HistoryItem } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parsePlaylistItem(value: unknown): PlaylistItem | null {
  if (!isRecord(value) ||
      !isString(value.id) ||
      !isString(value.title) ||
      !isString(value.bvid) ||
      !isString(value.cid) ||
      !isString(value.addedAt)) {
    return null;
  }

  // Do not carry legacy temporary CDN URLs back into persistent storage.
  return {
    id: value.id,
    title: value.title,
    bvid: value.bvid,
    cid: value.cid,
    addedAt: value.addedAt,
  };
}

function parsePlaylist(value: unknown): Playlist | null {
  if (!isRecord(value) ||
      !isString(value.id) ||
      !isString(value.name) ||
      !Array.isArray(value.items) ||
      !isString(value.createdAt) ||
      !isString(value.updatedAt)) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    items: value.items.map(parsePlaylistItem).filter((item): item is PlaylistItem => item !== null),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseHistoryItem(value: unknown): HistoryItem | null {
  if (!isRecord(value) ||
      !isString(value.title) ||
      !isString(value.bvid) ||
      !isString(value.cid) ||
      !isString(value.timestamp)) {
    return null;
  }

  return {
    title: value.title,
    bvid: value.bvid,
    cid: value.cid,
    timestamp: value.timestamp,
  };
}

export async function getUserPlaylists(): Promise<Playlist[]> {
  const result = await chrome.storage.local.get<{ userPlaylists?: unknown }>('userPlaylists');
  if (!Array.isArray(result.userPlaylists)) return [];

  return result.userPlaylists
    .map(parsePlaylist)
    .filter((playlist): playlist is Playlist => playlist !== null);
}

export async function getPlaybackHistory(): Promise<HistoryItem[]> {
  const result = await chrome.storage.local.get<{ playbackHistory?: unknown }>('playbackHistory');
  if (!Array.isArray(result.playbackHistory)) return [];

  return result.playbackHistory
    .map(parseHistoryItem)
    .filter((item): item is HistoryItem => item !== null);
}
