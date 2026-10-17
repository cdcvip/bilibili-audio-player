import { BilibiliVideoInfo } from './types';

export function requestBilibiliAudio(url: string, cid?: string): Promise<BilibiliVideoInfo | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { action: 'getBilibiliAudio', url, cid },
      (response: BilibiliVideoInfo | null) => {
        if (chrome.runtime.lastError) {
          console.error('Error fetching Bilibili audio:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response || null);
      },
    );
  });
}

export interface OpenPlayerResult {
  ok: boolean;
  error?: string;
}

/**
 * Ask the background worker to open the player window. The background answers
 * with a status so callers can surface failures instead of appearing to do
 * nothing when the request is rejected.
 */
export function requestOpenPlayer(data: BilibiliVideoInfo): Promise<OpenPlayerResult> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { action: 'openPlayer', data },
      (response: OpenPlayerResult | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: '后台服务没有响应' });
      },
    );
  });
}
