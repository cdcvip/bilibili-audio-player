import md5 from 'md5';

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// 对 imgKey 和 subKey 进行字符顺序打乱编码
const getMixinKey = (orig: string) =>
  mixinKeyEncTab
    .map((n) => orig[n])
    .join('')
    .slice(0, 32);

// 为请求参数进行 wbi 签名
export function encWbi(params: Record<string, any>, imgKey: string, subKey: string) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const currTime = Math.round(Date.now() / 1000);
  const chrFilter = /[!'()*]/g;

  Object.assign(params, { wts: currTime }); // 添加 wts 字段
  // 按照 key 重排参数
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      // 过滤 value 中的 "!'()*" 字符
      const value = params[key].toString().replace(chrFilter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  const wbiSign = md5(query + mixinKey); // 计算 w_rid

  const data = {
    wts: currTime,
    w_rid: wbiSign,
  };
  return {
    ...params,
    ...data,
  } as any as typeof params & typeof data;
  // return query + '&w_rid=' + wbiSign;
}

// Utility functions moved from bilibiliApi.ts

/**
 * Extract video ID (BV or AV) from Bilibili URL
 * @param url Bilibili video URL
 * @returns Video ID object containing aid, bvid, or null if not found
 */
export const extractVideoId = (url: string): { aid?: string; bvid?: string } | null => {
  const trimmed = url.trim();
  if (/^BV[a-zA-Z0-9]+$/.test(trimmed)) return { bvid: trimmed };
  if (/^av(\d+)$/i.test(trimmed)) return { aid: trimmed.replace(/^av/i, '') };

  // Match BV ID pattern
  const bvMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  if (bvMatch && bvMatch[1]) {
    return { bvid: bvMatch[1] };
  }

  // Match AV ID pattern
  const avMatch = url.match(/\/video\/av(\d+)/);
  if (avMatch && avMatch[1]) {
    return { aid: avMatch[1] };
  }

  // Match short URL pattern
  const shortMatch = url.match(/bilibili\.com\/([a-zA-Z0-9]+)/);
  if (shortMatch && shortMatch[1] && !shortMatch[1].includes('/')) {
    // Assuming it's a BV ID if it's not a path
    if (shortMatch[1].startsWith('BV')) {
      return { bvid: shortMatch[1] };
    } else if (shortMatch[1].startsWith('av')) {
      return { aid: shortMatch[1].substring(2) };
    }
  }

  return null;
};

/**
 * Check if current tab is a Bilibili video page
 * @param url Current tab URL
 * @returns Boolean indicating if URL is a Bilibili video page
 */
export const isBilibiliVideoPage = (url: string): boolean => {
  return /bilibili\.com\/video\/(av\d+|BV[a-zA-Z0-9]+)/.test(url);
};
