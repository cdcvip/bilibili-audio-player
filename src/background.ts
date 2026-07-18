import { getBilibiliAudio, initSignData } from './utils/bilibiliApi';
import { BilibiliVideoInfo } from './utils/types';

const AUTH_COOKIE_NAMES = [
  'SESSDATA',
  'buvid3',
  'buvid4',
  'buvid_fp',
  'bili_ticket',
  'b_nut',
] as const;

const BILIBILI_HOST_SUFFIX = '.bilibili.com';
const CDN_HOST_SUFFIXES = ['.bilivideo.com', '.bilivideo.cn'];

// Restrict the Referer workaround to media initiated by this extension.
async function setupCdnHeaderRules(): Promise<void> {
  const makeRule = (id: number, urlFilter: string): chrome.declarativeNetRequest.Rule => ({
    id,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: [
        { header: 'Referer', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://www.bilibili.com/' },
        { header: 'Origin', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://www.bilibili.com' },
      ],
    },
    condition: {
      urlFilter,
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MEDIA],
    },
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1001, 1002],
    addRules: [
      makeRule(1001, '||bilivideo.com/'),
      makeRule(1002, '||bilivideo.cn/'),
    ],
  });
}

function getCookie(name: string): Promise<chrome.cookies.Cookie | null> {
  return new Promise(resolve => {
    chrome.cookies.get({ url: 'https://www.bilibili.com/', name }, cookie => {
      resolve(chrome.runtime.lastError ? null : cookie || null);
    });
  });
}

// Read only the authentication/anti-bot cookies needed by Bilibili GET APIs.
// The resulting value stays inside the background worker and is never stored.
async function getBilibiliAuthCookieString(): Promise<string> {
  const cookies = await Promise.all(AUTH_COOKIE_NAMES.map(getCookie));
  return cookies
    .filter((cookie): cookie is chrome.cookies.Cookie => cookie !== null)
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;

  try {
    const url = new URL(sender.url);
    if (url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id) return true;

    return url.protocol === 'https:' &&
      (url.hostname === 'bilibili.com' || url.hostname.endsWith(BILIBILI_HOST_SUFFIX));
  } catch {
    return false;
  }
}

function isTrustedAudioUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string') return false;

  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && CDN_HOST_SUFFIXES.some(suffix => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function isValidVideoInfo(data: unknown): data is BilibiliVideoInfo {
  if (!data || typeof data !== 'object') return false;
  const value = data as Partial<BilibiliVideoInfo>;
  return typeof value.title === 'string' && value.title.length <= 500 &&
    typeof value.bvid === 'string' && /^BV[a-zA-Z0-9]+$/.test(value.bvid) &&
    typeof value.cid === 'string' && /^\d+$/.test(String(value.cid)) &&
    typeof value.page === 'number' &&
    Array.isArray(value.pages) &&
    isTrustedAudioUrl(value.audioUrl) &&
    (value.audioUrls === undefined ||
      (Array.isArray(value.audioUrls) &&
        value.audioUrls.length > 0 &&
        value.audioUrls.every(isTrustedAudioUrl)));
}

async function fetchAudioInfo(url: string, cid?: string): Promise<BilibiliVideoInfo | null> {
  const cookieString = await getBilibiliAuthCookieString();
  const info = await getBilibiliAudio(url, { cookieString }, cid);
  if (!info) return null;

  const audioUrls = [...new Set([info.audioUrl, ...(info.audioUrls || [])])]
    .filter(isTrustedAudioUrl);
  if (audioUrls.length === 0) return null;

  return { ...info, audioUrl: audioUrls[0], audioUrls };
}

function openPlayer(data: BilibiliVideoInfo): void {
  const query = new URLSearchParams({
    bvid: data.bvid,
    cid: String(data.cid),
  });

  void chrome.windows.create({
    url: chrome.runtime.getURL(`player.html?${query.toString()}`),
    type: 'popup',
    width: 400,
    height: 600,
  });
}

async function removeLegacySensitiveStorage(): Promise<void> {
  await chrome.storage.sync.remove('authConfig');
}

async function restrictStorageAccess(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: chrome.storage.AccessLevel.TRUSTED_CONTEXTS }),
    chrome.storage.sync.setAccessLevel({ accessLevel: chrome.storage.AccessLevel.TRUSTED_CONTEXTS }),
  ]);
}

async function setupContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'extractBilibiliAudio',
    title: '提取并播放音频',
    contexts: ['link'],
    documentUrlPatterns: ['https://*.bilibili.com/*'],
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await restrictStorageAccess();
    await Promise.all([
      setupCdnHeaderRules(),
      initSignData(),
      removeLegacySensitiveStorage(),
      setupContextMenu(),
    ]);
    console.log('Bilibili Audio Player extension initialized');
  } catch (error) {
    console.error('插件启动时初始化失败:', error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void restrictStorageAccess()
    .then(() => Promise.all([setupCdnHeaderRules(), removeLegacySensitiveStorage()]))
    .catch(error => console.error('插件启动时安全初始化失败:', error));
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isTrustedSender(sender) || !message || typeof message !== 'object') return false;

  const request = message as { action?: unknown; url?: unknown; cid?: unknown; data?: unknown };

  if (request.action === 'getBilibiliAudio') {
    if (typeof request.url !== 'string' || request.url.length > 2048) {
      sendResponse(null);
      return false;
    }

    if (request.cid !== undefined && (typeof request.cid !== 'string' || !/^\d+$/.test(request.cid))) {
      sendResponse(null);
      return false;
    }

    fetchAudioInfo(request.url, request.cid)
      .then(sendResponse)
      .catch(error => {
        console.error('Error in background getBilibiliAudio:', error);
        sendResponse(null);
      });
    return true;
  }

  if (request.action === 'openOptionsPage') {
    void chrome.runtime.openOptionsPage();
    sendResponse({ status: 'Options page opened or focused' });
    return false;
  }

  if (request.action === 'openPlayer' && isValidVideoInfo(request.data)) {
    openPlayer(request.data);
  }

  return false;
});

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId !== 'extractBilibiliAudio' || !info.linkUrl || info.linkUrl.length > 2048) return;

  void fetchAudioInfo(info.linkUrl)
    .then(videoInfo => {
      if (videoInfo && isValidVideoInfo(videoInfo)) openPlayer(videoInfo);
    })
    .catch(error => console.error('Error extracting audio from context menu:', error));
});
