/**
 * Bilibili API utilities for extracting audio URLs from video pages
 */
import {
  BilibiliVideoInfo,
  BilibiliPageInfo,
  AuthConfig,
  SignData,
  ViewApiResponseData, // Imported from types.ts
  PlayUrlApiResponseData, // Imported from types.ts
  BiliApiResponse,      // Imported from types.ts
} from './types'; 
import { encWbi, extractVideoId } from './util'; // extractVideoId imported from util.ts

const BILIBILI_API_BASE_URL = 'https://api.bilibili.com';

interface SpiData {
  b3: string;
  b4: string;
}

interface SignDataCache {
  signData?: unknown;
  cacheTime?: unknown;
  spiData?: unknown;
}

function isSignData(value: unknown): value is SignData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SignData>;
  return typeof candidate.imgKey === 'string' && typeof candidate.subKey === 'string';
}

function isSpiData(value: unknown): value is SpiData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SpiData>;
  return typeof candidate.b3 === 'string' && typeof candidate.b4 === 'string';
}

// Interfaces like ViewApiResponseData, DashAudioStream, etc., have been moved to types.ts
// Utility functions like extractVideoId, isBilibiliVideoPage, etc., have been moved to util.ts

async function makeSignedBiliApiRequest<T>(
  endpoint: string,
  params: Record<string, string>,
  authConfig?: AuthConfig
): Promise<T> {
  const { signData } = await initSignData(); 
  if (!signData) {
    throw new Error('Failed to get sign data for API request.');
  }

  const signedParamsObject = encWbi(params, signData.imgKey, signData.subKey);
  const signedParamsUrlString = new URLSearchParams(signedParamsObject).toString();

  const headers: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
  };

  if (authConfig?.cookieString) {
    headers.Cookie = authConfig.cookieString;
  }

  const response = await fetch(`${BILIBILI_API_BASE_URL}${endpoint}?${signedParamsUrlString}`, {
    method: 'GET',
    headers,
    redirect: 'error',
  });

  if (!response.ok) {
    throw new Error(`Bilibili API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BiliApiResponse<T>;

  if (data.code !== 0) {
    throw new Error(`Bilibili API error: ${data.code} - ${data.message || 'Unknown API error'}`);
  }
  if (!data.data) {
    throw new Error('Bilibili API error: No data returned.');
  }
  return data.data;
}

function parseSignData(json: any): SignData {  
  const imgUrl = json.data.wbi_img.img_url;  
  const subUrl = json.data.wbi_img.sub_url;  
    
  const imgKey = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));  
  const subKey = subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));  
    
  return {  
    imgKey: imgKey,  
    subKey: subKey  
  };  
}

async function getSignData() {  
  const headers: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
  };
  const response = await fetch(`${BILIBILI_API_BASE_URL}/x/web-interface/nav`, { 
    method: 'GET',  
    headers,
    redirect: 'error',
  });  
  
  if (response.ok) {  
    const data = await response.json();  
    return parseSignData(data);  
  } else {  
    throw new Error(`获取签名秘钥失败: ${response.status}`);
  }  
}  

async function getSpiData() {  
  const headers: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
  };
  const response = await fetch(`${BILIBILI_API_BASE_URL}/x/frontend/finger/spi`, { 
    method: 'GET',  
    headers,
    redirect: 'error',
  });  
  
  if (!response.ok) {  
    throw new Error(`获取SPI数据失败: ${response.status}`);  
  }  
  
  const data = await response.json();  
  return {  
    b3: data.data.b_3,  
    b4: data.data.b_4  
  };  
}

export async function initSignData() {  
  const cachedData = await chrome.storage.local.get<SignDataCache>([
    'signData',   
    'cacheTime',  
    'spiData'  
  ]);  
    
  const now = Date.now();  
  const oneDayInMs = 24 * 60 * 60 * 1000;  
    
  if (isSignData(cachedData.signData) &&
      typeof cachedData.cacheTime === 'number' &&
      isSpiData(cachedData.spiData) &&
      (now - cachedData.cacheTime) < oneDayInMs) {  
    console.log('使用缓存的签名数据');  
    return {  
      signData: cachedData.signData,  
      spiData: cachedData.spiData  
    };  
  }  
    
  console.log('缓存失效，重新获取签名数据');  
    
  try {  
    const [signData, spiData] = await Promise.all([  
      getSignData(),  
      getSpiData()  
    ]);  
      
    await chrome.storage.local.set({  
      signData: signData,  
      spiData: spiData,  
      cacheTime: now  
    });  
      
    console.log('签名数据获取成功并已缓存');  
    return { signData, spiData };  
      
  } catch (error) {  
    console.error('获取签名数据失败:', error);  
    throw error;  
  }  
}  

export async function sign(params: Record<string, string>) {
  const { signData } = await initSignData(); 
  if (signData) {
    return encWbi(params, signData.imgKey, signData.subKey);
  } else {
    console.error('Failed to get signData for signing parameters.');
    throw new Error('Authentication keys (signData) not available for signing.');
  }
}

export const fetchVideoInfo = async (
  videoId: { aid?: string; bvid?: string },
  authConfig?: AuthConfig
): Promise<{ title: string; cid: string; bvid: string; aid: string; pages: BilibiliPageInfo[] } | null> => {
  try {
    const params: Record<string, string> = {};
    if (videoId.bvid) {
      params.bvid = videoId.bvid;
    } else if (videoId.aid) {
      params.aid = videoId.aid;
    } else {
      console.error('Invalid video ID provided to fetchVideoInfo');
      return null; 
    }

    const data = await makeSignedBiliApiRequest<ViewApiResponseData>(
      '/x/web-interface/view',
      params,
      authConfig
    );

    const pages = Array.isArray(data.pages) && data.pages.length > 0
      ? data.pages.map((page, index) => ({
          cid: String(page.cid),
          page: Number.isInteger(page.page) && page.page > 0 ? page.page : index + 1,
          part: String(page.part || `P${index + 1}`),
          duration: Number.isFinite(page.duration) ? page.duration : 0,
        }))
      : [{
          cid: String(data.cid),
          page: 1,
          part: String(data.title),
          duration: 0,
        }];

    return {
      title: String(data.title),
      cid: pages[0].cid,
      bvid: String(data.bvid),
      aid: String(data.aid),
      pages,
    };
  } catch (error) {
    console.error('Error fetching video info:', error);
    return null;
  }
};

export const extractAudioUrl = async (
  videoInfo: { aid: string; bvid: string; cid: string },
  authConfig?: AuthConfig
): Promise<string | null> => {
  try {
    const params: Record<string, string> = {
      avid: videoInfo.aid,
      cid: videoInfo.cid,
      qn: '0',
      fnval: '4048', // DASH + HDR + 4K + Dolby Vision + Dolby Atmos + AV1 + FLAC
      fnver: '0',
      fourk: '1',
    };

    const data = await makeSignedBiliApiRequest<PlayUrlApiResponseData>(
      '/x/player/wbi/playurl',
      params,
      authConfig
    );
    
    // Dolby Atmos takes priority (highest quality)
    if (data.dolby?.audio && data.dolby.audio.length > 0) {
      const best = data.dolby.audio.reduce((a, b) => b.bandwidth > a.bandwidth ? b : a);
      return best.baseUrl || best.base_url || null;
    }

    if (data.dash && data.dash.audio && data.dash.audio.length > 0) {
      const best = data.dash.audio.reduce((a, b) => b.bandwidth > a.bandwidth ? b : a);
      return best.baseUrl || best.base_url || null;
    }

    if (data.durl && data.durl.length > 0 && data.durl[0].url) {
      return data.durl[0].url;
    }
    
    console.warn('No audio stream found in API response for video:', videoInfo.bvid);
    return null; 
  } catch (error) {
    console.error('Error extracting audio URL:', error);
    return null;
  }
};

export const getBilibiliAudio = async (
  url: string,
  authConfig?: AuthConfig,
  requestedCid?: string,
): Promise<BilibiliVideoInfo | null> => {
  try {
    const videoId = extractVideoId(url); // Now imported from util.ts
    if (!videoId) {
      throw new Error('Invalid Bilibili URL');
    }

    const videoInfo = await fetchVideoInfo(videoId, authConfig);
    if (!videoInfo) {
      throw new Error('Failed to fetch video info');
    }

    let requestedPage: number | undefined;
    try {
      const parsedUrl = new URL(url);
      const pageParam = Number(parsedUrl.searchParams.get('p'));
      if (Number.isInteger(pageParam) && pageParam > 0) requestedPage = pageParam;
    } catch {
      // Bare BV/AV identifiers intentionally have no URL parameters.
    }

    const selectedPage = requestedCid
      ? videoInfo.pages.find(page => page.cid === requestedCid)
      : requestedPage
        ? videoInfo.pages.find(page => page.page === requestedPage)
        : videoInfo.pages[0];

    if (!selectedPage) {
      throw new Error('Requested video part does not exist');
    }

    const selectedVideoInfo = { ...videoInfo, cid: selectedPage.cid };
    const audioUrl = await extractAudioUrl(selectedVideoInfo, authConfig);
    if (!audioUrl) {
      throw new Error('Failed to extract audio URL');
    }

    return {
      title: videoInfo.pages.length > 1
        ? `${videoInfo.title} · P${selectedPage.page} ${selectedPage.part}`
        : videoInfo.title,
      aid: videoInfo.aid,
      bvid: videoInfo.bvid,
      cid: selectedPage.cid,
      audioUrl,
      page: selectedPage.page,
      pages: videoInfo.pages,
    };
  } catch (error) {
    console.error('Error in getBilibiliAudio:', error);
    return null;
  }
};

// URL parsing helpers live in src/utils/util.ts.
