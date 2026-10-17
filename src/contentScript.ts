// Content script for Bilibili pages
import { isBilibiliVideoPage } from './utils/util';
import { requestBilibiliAudio, requestOpenPlayer } from './utils/runtimeApi';

const BUTTON_ID = 'bili-audio-extract-btn';
const STATUS_ID = 'bili-audio-extract-status';
const CONTEXT_LOST_MESSAGE = '扩展已更新，请刷新页面后重试';

type StatusType = 'info' | 'success' | 'error';

const STATUS_COLORS: Record<StatusType, string> = {
  info: '#333333',
  success: '#2e7d32',
  error: '#c62828',
};

// After an extension reload/update this script keeps running in the page but
// `chrome.runtime` is gone, so every message throws. Detect it up front so the
// user gets an actionable message instead of a dead button.
function isExtensionContextAlive(): boolean {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

function isContextLostError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Extension context invalidated|Receiving end does not exist/i.test(message);
}

// The background re-injects this script into already-open tabs, so the UI must
// be idempotent: drop any previous copy before adding a fresh one.
function removeExistingUi(): void {
  document.getElementById(BUTTON_ID)?.parentElement?.remove();
  document.getElementById(STATUS_ID)?.remove();
}

function showStatus(message: string, type: StatusType): void {
  const status = document.getElementById(STATUS_ID);
  if (!status) return;

  status.textContent = message;
  status.style.color = STATUS_COLORS[type];
  status.style.display = 'block';
}

function hideStatus(): void {
  const status = document.getElementById(STATUS_ID);
  if (status) status.style.display = 'none';
}

function createUi(): HTMLButtonElement | null {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    font-family: 'Microsoft YaHei', system-ui, sans-serif;
  `;

  const status = document.createElement('div');
  status.id = STATUS_ID;
  status.style.cssText = `
    display: none;
    max-width: 260px;
    padding: 8px 12px;
    border-radius: 8px;
    background-color: #ffffff;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
  `;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = '🎵 提取音频';
  button.style.cssText = `
    background-color: #fb7299;
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 20px;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    cursor: pointer;
    display: flex;
    align-items: center;
  `;

  wrapper.append(status, button);
  document.body.appendChild(wrapper);
  return button;
}

async function extractAudio(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) return;

  if (!isExtensionContextAlive()) {
    showStatus(CONTEXT_LOST_MESSAGE, 'error');
    return;
  }

  button.disabled = true;
  showStatus('正在提取音频…', 'info');

  try {
    // Cookie access and API requests remain isolated in the background worker.
    const videoInfo = await requestBilibiliAudio(window.location.href);
    if (!videoInfo) {
      showStatus('无法提取音频，请检查登录状态或视频可用性', 'error');
      return;
    }

    const result = await requestOpenPlayer(videoInfo);
    if (!result.ok) {
      showStatus(result.error || '打开播放器失败，请重试', 'error');
      return;
    }

    showStatus('已发送到播放器', 'success');
    window.setTimeout(hideStatus, 3000);
  } catch (error) {
    console.error('Error extracting audio:', error);
    showStatus(
      isContextLostError(error) ? CONTEXT_LOST_MESSAGE : `提取音频失败：${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    button.disabled = false;
  }
}

// Check if current page is a Bilibili video page
if (isBilibiliVideoPage(window.location.href)) {
  console.log('Bilibili video page detected');

  removeExistingUi();
  const button = createUi();
  button?.addEventListener('click', () => void extractAudio(button));
}
