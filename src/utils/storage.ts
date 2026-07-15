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

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
  updatedAt: string;
}

type PlaybackProgressMap = Record<string, PlaybackProgress>;

function progressKey(bvid: string, cid: string): string {
  return `${bvid}:${cid}`;
}

function parsePlaybackProgress(value: unknown): PlaybackProgress | null {
  if (!isRecord(value) ||
      typeof value.currentTime !== 'number' || !Number.isFinite(value.currentTime) || value.currentTime < 0 ||
      typeof value.duration !== 'number' || !Number.isFinite(value.duration) || value.duration <= 0 ||
      !isString(value.updatedAt)) {
    return null;
  }

  return {
    currentTime: value.currentTime,
    duration: value.duration,
    updatedAt: value.updatedAt,
  };
}

async function getPlaybackProgressMap(): Promise<PlaybackProgressMap> {
  const result = await chrome.storage.local.get<{ playbackProgress?: unknown }>('playbackProgress');
  if (!isRecord(result.playbackProgress)) return {};

  const progress: PlaybackProgressMap = {};
  Object.entries(result.playbackProgress).forEach(([key, value]) => {
    const parsed = parsePlaybackProgress(value);
    if (parsed) progress[key] = parsed;
  });
  return progress;
}

export async function getPlaybackProgress(bvid: string, cid: string): Promise<PlaybackProgress | null> {
  const progress = await getPlaybackProgressMap();
  return progress[progressKey(bvid, cid)] || null;
}

export async function savePlaybackProgress(
  bvid: string,
  cid: string,
  currentTime: number,
  duration: number,
): Promise<void> {
  if (!Number.isFinite(currentTime) || currentTime < 0 ||
      !Number.isFinite(duration) || duration <= 0) return;

  const progress = await getPlaybackProgressMap();
  progress[progressKey(bvid, cid)] = {
    currentTime: Math.min(currentTime, duration),
    duration,
    updatedAt: new Date().toISOString(),
  };

  const recentEntries = Object.entries(progress)
    .sort(([, first], [, second]) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, 200);
  const recentProgress: PlaybackProgressMap = {};
  recentEntries.forEach(([key, value]) => {
    recentProgress[key] = value;
  });
  await chrome.storage.local.set({ playbackProgress: recentProgress });
}

export async function clearPlaybackProgress(bvid: string, cid: string): Promise<void> {
  const progress = await getPlaybackProgressMap();
  delete progress[progressKey(bvid, cid)];
  await chrome.storage.local.set({ playbackProgress: progress });
}
