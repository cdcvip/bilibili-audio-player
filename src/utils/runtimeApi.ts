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
