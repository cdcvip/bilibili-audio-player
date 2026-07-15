// Player page script
import { Playlist, PlaylistItem } from './utils/playlistTypes'; // 1. Import Playlist Types
import { requestBilibiliAudio } from './utils/runtimeApi';
import {
  clearPlaybackProgress,
  getPlaybackHistory,
  getPlaybackProgress,
  getUserPlaylists,
  savePlaybackProgress,
} from './utils/storage';
import { BilibiliVideoInfo, HistoryItem } from "./utils/types";


document.addEventListener('DOMContentLoaded', () => {
  const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;
  const headerTitle = document.getElementById('header-title') as HTMLHeadingElement;
  const videoTitle = document.getElementById('video-title') as HTMLDivElement;
  const videoId = document.getElementById('video-id') as HTMLDivElement;
  const statusMessage = document.getElementById('status-message') as HTMLDivElement; // 2. Updated DOM ref
  const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
  const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
  const addToPlaylistBtn = document.getElementById('add-to-playlist-btn') as HTMLButtonElement; // 2. New DOM ref
  
  // Custom player controls
  const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  const playIcon = document.getElementById('play-icon') as HTMLElement;
  const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
  const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
  const timeDisplay = document.getElementById('time-display') as HTMLDivElement;
  const volumeIcon = document.getElementById('volume-icon') as HTMLDivElement;
  const volumeSlider = document.getElementById('volume-slider') as HTMLDivElement;
  const volumeLevel = document.getElementById('volume-level') as HTMLDivElement;
  const episodeControl = document.getElementById('episode-control') as HTMLDivElement;
  const episodeSelect = document.getElementById('episode-select') as HTMLSelectElement;
  const playbackRateSelect = document.getElementById('playback-rate-select') as HTMLSelectElement;
  const playbackRateDown = document.getElementById('playback-rate-down') as HTMLButtonElement;
  const playbackRateUp = document.getElementById('playback-rate-up') as HTMLButtonElement;
  const seekBackwardBtn = document.getElementById('seek-backward-btn') as HTMLButtonElement;
  const seekForwardBtn = document.getElementById('seek-forward-btn') as HTMLButtonElement;
  
  // Playlist specific DOM elements
  const playlistInfoDiv = document.getElementById('playlist-info') as HTMLDivElement;
  const playlistNameEl = document.getElementById('playlist-name') as HTMLParagraphElement;
  const playlistTrackIndicatorEl = document.getElementById('playlist-track-indicator') as HTMLParagraphElement;
  const prevTrackBtn = document.getElementById('prev-track-btn') as HTMLButtonElement;
  const nextTrackBtn = document.getElementById('next-track-btn') as HTMLButtonElement;

  // Modal DOM elements
  const customModalOverlay = document.getElementById('custom-modal-overlay') as HTMLDivElement;
  const modalTitle = document.getElementById('modal-title') as HTMLHeadingElement;
  const modalMessageText = document.getElementById('modal-message-text') as HTMLParagraphElement;
  const modalPlaylistList = document.getElementById('modal-playlist-list') as HTMLUListElement;
  const modalConfirmBtn = document.getElementById('modal-confirm-btn') as HTMLButtonElement;
  const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;

  let videoData: CurrentTrackData | null = null; // Updated type
  
  // State variables for playlist
  let currentPlaylist: PlaylistItem[] | null = null;
  let currentPlaylistName: string | null = null;
  let currentTrackIndex: number = -1;
  let isPlaylistMode: boolean = false;
  const minPlaybackRate = 0.25;
  const maxPlaybackRate = 3;
  const playbackRateStep = 0.05;
  let preferredPlaybackRate = 1;
  let pendingResumePosition = 0;
  let lastProgressSaveAt = 0;
  let progressWriteQueue: Promise<void> = Promise.resolve();
  let currentTrackCompleted = false;

  type CurrentTrackData = BilibiliVideoInfo;

  function isSameTrack(
    first: Pick<CurrentTrackData, 'bvid' | 'cid'>,
    second: Pick<PlaylistItem, 'bvid' | 'cid'>,
  ): boolean {
    return first.bvid === second.bvid && first.cid === second.cid;
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;

    if (message.action === 'playPlaylist') {
      isPlaylistMode = true;
      const { playlist, startIndex } = message.data as { playlist: Playlist, startIndex: number };
      currentPlaylist = playlist.items; // These items should now have bvid/cid, audioUrl is optional
      currentPlaylistName = playlist.name;
      currentTrackIndex = startIndex || 0;
      startOrContinuePlaylistPlayback(); // This will now fetch fresh audioUrl
      updatePlaylistUI();
    } else if (message.action === 'playAudio' && message.data) {
      isPlaylistMode = false;
      currentPlaylist = null;
      currentPlaylistName = null;
      currentTrackIndex = -1;
      // videoData is now expected to include bvid and cid from popup.ts
      videoData = message.data as CurrentTrackData; 
      initializePlayer(videoData);
      updatePlaylistUI();
    }
  });
  
  // Check if video data was passed via URL parameters (fallback)
  const urlParams = new URLSearchParams(window.location.search);
  const bvidParam = urlParams.get('bvid');
  const cidParam = urlParams.get('cid');
  
  if (bvidParam && cidParam) {
    showPlayerMessage('正在加载选集信息...', 'info');
    void requestBilibiliAudio(`https://www.bilibili.com/video/${bvidParam}`, cidParam)
      .then(freshInfo => {
        if (freshInfo) {
          isPlaylistMode = false;
          void initializePlayer(freshInfo);
          updatePlaylistUI();
        } else {
          showPlayerMessage('无法加载所选分集', 'error');
        }
      });
  }
  
  // Function to start or continue playlist playback
  async function startOrContinuePlaylistPlayback() {
    if (isPlaylistMode && currentPlaylist && currentTrackIndex >= 0 && currentTrackIndex < currentPlaylist.length) {
      const trackItem = currentPlaylist[currentTrackIndex]; // This is a PlaylistItem
      
      // Fetch fresh audio URL using bvid and cid from trackItem
      showPlayerMessage(`正在加载: ${trackItem.title}`, 'info');
      const freshVideoInfo = await requestBilibiliAudio(
        `https://www.bilibili.com/video/${trackItem.bvid}`,
        trackItem.cid,
      );

      if (freshVideoInfo && freshVideoInfo.audioUrl) {
        await initializePlayer(freshVideoInfo);
        updatePlaylistUI(); // Update track indicator
      } else {
        showPlayerMessage(`无法加载 "${trackItem.title}"。请检查网络或视频状态。`, 'error');
        // Optionally, skip to next track or stop playback
        if (isPlaylistMode && currentPlaylist) { // Advance to next to avoid getting stuck
            currentTrackIndex++;
            if (currentTrackIndex < currentPlaylist.length) {
                startOrContinuePlaylistPlayback();
            } else {
                isPlaylistMode = false;
                showPlayerMessage('播放列表已结束。', 'info');
                updatePlaylistUI();
            }
        }
      }
    } else if (isPlaylistMode) {
      // Playlist ended or invalid state
      isPlaylistMode = false;
      showPlayerMessage('播放列表已结束或状态无效。', 'info');
      updatePlaylistUI();
    }
  }
  
  // Initialize player with video data
  async function initializePlayer(data: CurrentTrackData) { // data is the videoData for current video
    if (!data || !data.audioUrl) {
      showPlayerMessage('无法加载音频数据', 'error');
      return;
    }
    
    if (videoData && audioPlayer.currentSrc && !currentTrackCompleted) {
      await persistCurrentProgress(true);
    }

    // Store videoData at module level for access by other functions
    videoData = data; // Ensure videoData is assigned here
    currentTrackCompleted = false;

    const [, savedProgress] = await Promise.all([
      updatePlaybackHistory(videoData),
      getPlaybackProgress(videoData.bvid, videoData.cid),
    ]);
    pendingResumePosition = savedProgress?.currentTime || 0;
    lastProgressSaveAt = 0;
    
    // Set video info
    headerTitle.textContent = videoData.title;
    videoTitle.textContent = videoData.title;
    videoId.textContent = `BV: ${videoData.bvid}${videoData.pages.length > 1 ? ` · P${videoData.page}` : ''}`;
    updateEpisodeSelector(videoData);
    
    // Set audio source
    audioPlayer.src = videoData.audioUrl;
    audioPlayer.volume = 0.7; // Default volume
    audioPlayer.playbackRate = preferredPlaybackRate;
    
    // Update volume level display
    updateVolumeLevel(audioPlayer.volume);

    // Check and set favorite icon state
    const isFav = await checkIfVideoIsFavorited(videoData);
    updateFavoriteIcon(isFav);
    
    // Listen for media load errors (e.g. 403 from CDN)
    audioPlayer.onerror = () => {
      const code = audioPlayer.error?.code;
      const msg = audioPlayer.error?.message || '';
      console.error('Audio load error:', code, msg);
      showPlayerMessage(`音频加载失败 (code ${code})，请检查网络或重试`, 'error');
    };

    // Muted autoplay bypasses Chrome's autoplay policy; unmute immediately after
    audioPlayer.muted = true;
    audioPlayer.play().then(() => {
      audioPlayer.muted = false;
    }).catch(error => {
      audioPlayer.muted = false;
      console.error('Auto-play failed:', error?.toString());
      showPlayerMessage('自动播放失败，请点击播放按钮手动播放', 'error');
    });
    
  }

  function updateEpisodeSelector(data: CurrentTrackData) {
    episodeSelect.innerHTML = '';

    if (data.pages.length <= 1) {
      episodeControl.style.display = 'none';
      updateNavigationControls();
      return;
    }

    data.pages.forEach(page => {
      const option = document.createElement('option');
      option.value = page.cid;
      option.textContent = `P${page.page} ${page.part}`;
      option.selected = page.cid === data.cid;
      episodeSelect.appendChild(option);
    });
    episodeControl.style.display = 'flex';
    updateNavigationControls();
  }

  async function switchEpisode(selectedCid: string, automatic = false) {
    if (!videoData || selectedCid === videoData.cid) return;

    episodeSelect.disabled = true;
    showPlayerMessage(automatic ? '正在自动播放下一集...' : '正在切换选集...', 'info');

    try {
      const freshInfo = await requestBilibiliAudio(
        `https://www.bilibili.com/video/${videoData.bvid}`,
        selectedCid,
      );
      if (!freshInfo) {
        updateEpisodeSelector(videoData);
        showPlayerMessage('切换选集失败，请稍后重试', 'error');
        return;
      }

      isPlaylistMode = false;
      currentPlaylist = null;
      currentPlaylistName = null;
      currentTrackIndex = -1;
      updatePlaylistUI();
      await initializePlayer(freshInfo);
    } catch (error) {
      console.error('Error switching video part:', error);
      if (videoData) updateEpisodeSelector(videoData);
      showPlayerMessage('切换选集失败，请稍后重试', 'error');
    } finally {
      episodeSelect.disabled = false;
    }
  }

  episodeSelect.addEventListener('change', () => {
    void switchEpisode(episodeSelect.value);
  });

  function normalizePlaybackRate(rate: number): number {
    const clamped = Math.max(minPlaybackRate, Math.min(maxPlaybackRate, rate));
    return Math.round(clamped * 100) / 100;
  }

  function updatePlaybackRateControls() {
    playbackRateSelect.querySelector('option[data-custom="true"]')?.remove();

    const matchingOption = Array.from(playbackRateSelect.options).find(option =>
      Number(option.value) === preferredPlaybackRate
    );
    if (!matchingOption) {
      const customOption = document.createElement('option');
      customOption.value = String(preferredPlaybackRate);
      customOption.textContent = `${preferredPlaybackRate.toFixed(2)}×`;
      customOption.dataset.custom = 'true';
      playbackRateSelect.appendChild(customOption);
    }

    playbackRateSelect.value = String(preferredPlaybackRate);
    playbackRateDown.disabled = preferredPlaybackRate <= minPlaybackRate;
    playbackRateUp.disabled = preferredPlaybackRate >= maxPlaybackRate;
  }

  function applyPlaybackRate(rate: number, persist = true) {
    if (!Number.isFinite(rate)) return;

    preferredPlaybackRate = normalizePlaybackRate(rate);
    audioPlayer.playbackRate = preferredPlaybackRate;
    updatePlaybackRateControls();
    if (persist) void chrome.storage.local.set({ playbackRate: preferredPlaybackRate });
  }

  async function loadPlaybackRate() {
    try {
      const result = await chrome.storage.local.get<{ playbackRate?: unknown }>('playbackRate');
      const storedRate = result.playbackRate;
      if (typeof storedRate === 'number' && Number.isFinite(storedRate) &&
          storedRate >= minPlaybackRate && storedRate <= maxPlaybackRate) {
        preferredPlaybackRate = normalizePlaybackRate(storedRate);
      }
    } catch (error) {
      console.error('Error loading playback rate:', error);
    }

    applyPlaybackRate(preferredPlaybackRate, false);
  }

  playbackRateSelect.addEventListener('change', () => {
    applyPlaybackRate(Number(playbackRateSelect.value));
  });

  playbackRateDown.addEventListener('click', () => {
    applyPlaybackRate(preferredPlaybackRate - playbackRateStep);
  });

  playbackRateUp.addEventListener('click', () => {
    applyPlaybackRate(preferredPlaybackRate + playbackRateStep);
  });

  // Update playback history in chrome.storage.local
  async function updatePlaybackHistory(videoData: CurrentTrackData) { // Changed type to CurrentTrackData
    const newHistoryItem: HistoryItem = {
      title: videoData.title,
      bvid: videoData.bvid, // Now directly from CurrentTrackData, which should be valid
      cid: videoData.cid,   // Now directly from CurrentTrackData
      timestamp: new Date().toISOString(),
    };

    try {
      let history = await getPlaybackHistory();

      // Remove legacy temporary CDN URLs while normalizing history records.
      history = history.map(item => {
        const { audioUrl: _legacyAudioUrl, ...safeItem } = item;
        return safeItem;
      });

      const existingItemIndex = history.findIndex(item =>
        item.bvid === newHistoryItem.bvid && item.cid === newHistoryItem.cid
      );

      if (existingItemIndex !== -1) {
        history.splice(existingItemIndex, 1);
      }

      // Add the new item to the beginning
      history.unshift(newHistoryItem);

      // Limit history to 100 items
      if (history.length > 100) {
        history = history.slice(0, 100);
      }

      await chrome.storage.local.set({ playbackHistory: history });
      console.log('Playback history updated.');
    } catch (error) {
      console.error('Error updating playback history:', error);
    }
  }

  function togglePlayback() {
    if (!audioPlayer.currentSrc) return;

    if (audioPlayer.paused) {
      void audioPlayer.play().catch(error => {
        console.error('Manual play failed:', error);
        showPlayerMessage('播放失败，请稍后重试', 'error');
      });
    } else {
      audioPlayer.pause();
      void persistCurrentProgress(true);
    }
  }

  function enqueueProgressWrite(operation: () => Promise<void>): Promise<void> {
    progressWriteQueue = progressWriteQueue
      .then(operation)
      .catch(error => console.error('Error persisting playback progress:', error));
    return progressWriteQueue;
  }

  function persistCurrentProgress(force = false): Promise<void> {
    if (currentTrackCompleted || !videoData || !audioPlayer.currentSrc ||
        !Number.isFinite(audioPlayer.currentTime) ||
        !Number.isFinite(audioPlayer.duration) || audioPlayer.duration <= 0) {
      return progressWriteQueue;
    }

    const now = Date.now();
    if (!force && now - lastProgressSaveAt < 5000) return progressWriteQueue;
    lastProgressSaveAt = now;

    const { bvid, cid } = videoData;
    const currentTime = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    return enqueueProgressWrite(() => savePlaybackProgress(bvid, cid, currentTime, duration));
  }

  function clearCurrentProgress(): Promise<void> {
    if (!videoData) return progressWriteQueue;
    const { bvid, cid } = videoData;
    pendingResumePosition = 0;
    return enqueueProgressWrite(() => clearPlaybackProgress(bvid, cid));
  }

  function seekBy(seconds: number) {
    if (!Number.isFinite(audioPlayer.duration) || audioPlayer.duration <= 0) return;
    const currentTime = Number.isFinite(audioPlayer.currentTime) ? audioPlayer.currentTime : 0;
    audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, currentTime + seconds));
  }

  async function navigateRelative(offset: -1 | 1) {
    if (isPlaylistMode && currentPlaylist) {
      const nextIndex = currentTrackIndex + offset;
      if (nextIndex < 0 || nextIndex >= currentPlaylist.length) return;
      currentTrackIndex = nextIndex;
      updateNavigationControls();
      await startOrContinuePlaylistPlayback();
      return;
    }

    if (!videoData || videoData.pages.length <= 1) return;
    const currentPageIndex = videoData.pages.findIndex(page => page.cid === videoData?.cid);
    const targetPage = videoData.pages[currentPageIndex + offset];
    if (currentPageIndex >= 0 && targetPage) {
      await switchEpisode(targetPage.cid);
    }
  }
  
  // Initialize custom player controls
  function initializeCustomControls() {
    // Audio ended listener (for playlist progression)
    audioPlayer.addEventListener('ended', () => {
      currentTrackCompleted = true;
      void clearCurrentProgress();
      if (isPlaylistMode && currentPlaylist) {
        currentTrackIndex++;
        if (currentTrackIndex < currentPlaylist.length) {
          startOrContinuePlaylistPlayback();
        } else {
          // Playlist ended
          isPlaylistMode = false;
          showPlayerMessage('播放列表已结束。', 'info');
          updatePlaylistUI(); // Hide playlist controls and info
        }
      } else if (videoData && videoData.pages.length > 1) {
        const currentPageIndex = videoData.pages.findIndex(page => page.cid === videoData?.cid);
        const nextPage = videoData.pages[currentPageIndex + 1];
        if (currentPageIndex >= 0 && nextPage) {
          void switchEpisode(nextPage.cid, true);
        } else {
          showPlayerMessage('已播放完最后一集。', 'info');
        }
      }
    });

    // Next episode/playlist item button listener
    nextTrackBtn.addEventListener('click', () => {
      void navigateRelative(1);
    });

    // Previous episode/playlist item button listener
    prevTrackBtn.addEventListener('click', () => {
      void navigateRelative(-1);
    });

    seekBackwardBtn.addEventListener('click', () => seekBy(-10));
    seekForwardBtn.addEventListener('click', () => seekBy(10));
    
    // Play/Pause button
    playPauseBtn.addEventListener('click', () => {
      togglePlayback();
    });

    document.addEventListener('keydown', event => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)) {
        return;
      }

      event.preventDefault();
      togglePlayback();
    });
    
    // Update play/pause icon based on player state
    audioPlayer.addEventListener('play', () => {
      playIcon.className = 'icon-pause';
    });
    
    audioPlayer.addEventListener('pause', () => {
      playIcon.className = 'icon-play';
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
      audioPlayer.playbackRate = preferredPlaybackRate;
      if (pendingResumePosition >= 3 &&
          pendingResumePosition < audioPlayer.duration - 3) {
        audioPlayer.currentTime = pendingResumePosition;
        showPlayerMessage(`已从 ${formatTime(pendingResumePosition)} 继续播放`, 'info');
      }
      pendingResumePosition = 0;
    });
    
    // Progress bar
    audioPlayer.addEventListener('timeupdate', () => {
      const progress = Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0
        ? (audioPlayer.currentTime / audioPlayer.duration) * 100
        : 0;
      progressBar.style.width = `${progress}%`;
      
      // Update time display
      const currentTime = formatTime(audioPlayer.currentTime);
      const duration = formatTime(audioPlayer.duration);
      timeDisplay.textContent = `${currentTime} / ${duration}`;
      void persistCurrentProgress();
    });
    
    // Click on progress bar to seek
    progressContainer.addEventListener('click', (e) => {
      if (!Number.isFinite(audioPlayer.duration) || audioPlayer.duration <= 0) return;
      const rect = progressContainer.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      audioPlayer.currentTime = pos * audioPlayer.duration;
      void persistCurrentProgress(true);
    });
    
    // Volume control
    volumeIcon.addEventListener('click', () => {
      if (audioPlayer.volume > 0) {
        audioPlayer.volume = 0;
        volumeIcon.className = 'volume-icon icon-mute';
      } else {
        audioPlayer.volume = 0.7;
        volumeIcon.className = 'volume-icon icon-volume';
      }
      updateVolumeLevel(audioPlayer.volume);
    });
    
    // Click on volume slider to change volume
    volumeSlider.addEventListener('click', (e) => {
      const rect = volumeSlider.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      audioPlayer.volume = Math.max(0, Math.min(1, pos));
      updateVolumeLevel(audioPlayer.volume);
      
      // Update volume icon
      volumeIcon.className = audioPlayer.volume > 0 ? 'volume-icon icon-volume' : 'volume-icon icon-mute';
    });
    
    // Settings button
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    
    // Close button
    closeBtn.addEventListener('click', () => {
      void persistCurrentProgress(true);
      window.close();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistCurrentProgress(true);
    });

    window.addEventListener('pagehide', () => {
      void persistCurrentProgress(true);
    });

    // Add to Playlist button event listener (5)
    addToPlaylistBtn.addEventListener('click', async () => {
      const currentVideoData = videoData;
      if (!currentVideoData || !currentVideoData.audioUrl) {
        showPlayerMessage('当前无视频信息可添加或移除。', 'error');
        return;
      }

      const isCurrentlyFavorited = addToPlaylistBtn.classList.contains('is-favorited');

      if (isCurrentlyFavorited) {
        // --- Unfavorite Logic: Remove from all playlists ---
        showConfirmationModal(
          "确定要从所有播放合集中移除此歌曲吗？此操作会将其从所有包含它的合集中移除。",
          async () => { // onConfirm
            try {
              const playlists = await getUserPlaylists();
              let modified = false;

              playlists.forEach(playlist => {
                const initialLength = playlist.items.length;
                playlist.items = playlist.items.filter(item => !isSameTrack(currentVideoData, item));
                if (playlist.items.length < initialLength) {
                  playlist.updatedAt = new Date().toISOString();
                  modified = true;
                }
              });

              if (modified) {
                await chrome.storage.local.set({ userPlaylists: playlists });
                showPlayerMessage('已从所有播放合集中移除。', 'success');
              } else {
                showPlayerMessage('歌曲未在任何播放合集中找到。', 'info');
              }
              updateFavoriteIcon(false);
            } catch (error) {
              console.error('Error removing from playlists:', error);
              showPlayerMessage('从播放合集中移除失败。', 'error');
            }
          }
        );
      } else {
        // --- Favorite Logic: Add to a selected playlist ---
        try {
          const playlists = await getUserPlaylists();

          if (playlists.length === 0) {
            const now = new Date().toISOString();
            const defaultPlaylist: Playlist = {
              id: `default-${Date.now()}`,
              name: '默认合集',
              items: [{
                id: Date.now().toString(),
                title: currentVideoData.title,
                bvid: currentVideoData.bvid,
                cid: currentVideoData.cid,
                addedAt: now,
              }],
              createdAt: now,
              updatedAt: now,
            };
            await chrome.storage.local.set({ userPlaylists: [defaultPlaylist] });
            showPlayerMessage('已创建“默认合集”并加入当前音频', 'success');
            updateFavoriteIcon(true);
            return;
          }

          showPlaylistSelectionModal(playlists, async (selectedPlaylist) => {
            if (!selectedPlaylist) return; // User cancelled or no selection

            const isDuplicate = selectedPlaylist.items.some((item: PlaylistItem) =>
              isSameTrack(currentVideoData, item)
            );

            if (isDuplicate) {
              showPlayerMessage(`"${currentVideoData.title}" 已存在于播放合集 "${selectedPlaylist.name}"。`, 'error');
              updateFavoriteIcon(true); // Ensure icon reflects favorited status
              return;
            }

            const newPlaylistItem: PlaylistItem = {
              id: Date.now().toString(),
              title: currentVideoData.title,
              bvid: currentVideoData.bvid, // currentVideoData is videoData (CurrentTrackData)
              cid: currentVideoData.cid,   // Add cid
              addedAt: new Date().toISOString(),
            };

            selectedPlaylist.items.push(newPlaylistItem);
            selectedPlaylist.updatedAt = new Date().toISOString();

            // Update the specific playlist in the overall playlists array
            const playlistIndex = playlists.findIndex(p => p.id === selectedPlaylist.id);
            if (playlistIndex > -1) {
              playlists[playlistIndex] = selectedPlaylist;
            }

            await chrome.storage.local.set({ userPlaylists: playlists });
            showPlayerMessage(`已添加到播放合集 "${selectedPlaylist.name}"`, 'success');
            updateFavoriteIcon(true);
          });

        } catch (error) {
          console.error('Error adding to playlist:', error);
          showPlayerMessage('添加到播放合集失败。', 'error');
        }
      }
    });
  }
  
  // Update volume level display
  function updateVolumeLevel(volume: number) {
    volumeLevel.style.width = `${volume * 100}%`;
  }
  
  // Format time in MM:SS
  function formatTime(seconds: number) {
    if (isNaN(seconds)) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Show player status message (4. Replaces showError)
  function showPlayerMessage(message: string, type: 'success' | 'error' | 'info') {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`; // Uses new class names from HTML
    statusMessage.classList.add('show');

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMessage.classList.remove('show');
      statusMessage.textContent = '';
      statusMessage.className = 'status-message';
    }, 3000);
  }

  // --- Favorite Icon Logic ---
  function updateFavoriteIcon(isFavorited: boolean) {
    if (addToPlaylistBtn) {
      if (isFavorited) {
        addToPlaylistBtn.classList.add('is-favorited');
        addToPlaylistBtn.title = "已在播放合集中";
      } else {
        addToPlaylistBtn.classList.remove('is-favorited');
        addToPlaylistBtn.title = "添加到播放合集";
      }
    }
  }

  async function checkIfVideoIsFavorited(currentVideoData: CurrentTrackData | null): Promise<boolean> {
    if (!currentVideoData) {
      return false;
    }
    try {
      const playlists = await getUserPlaylists();

      for (const playlist of playlists) {
        const isPresent = playlist.items.some((item: PlaylistItem) =>
          isSameTrack(currentVideoData, item)
        );
        if (isPresent) {
          return true; // Found in at least one playlist
        }
      }
    } catch (error) {
      console.error('Error checking favorite status:', error);
    }
    return false; // Not found in any playlist
  }
  // --- End Favorite Icon Logic ---

  // Function to update playlist UI elements
  function updateNavigationControls() {
    if (isPlaylistMode && currentPlaylist) {
      prevTrackBtn.textContent = '上一首';
      nextTrackBtn.textContent = '下一首';
      prevTrackBtn.title = '播放列表上一首';
      nextTrackBtn.title = '播放列表下一首';
      prevTrackBtn.disabled = currentTrackIndex <= 0;
      nextTrackBtn.disabled = currentTrackIndex < 0 || currentTrackIndex >= currentPlaylist.length - 1;
      return;
    }

    prevTrackBtn.textContent = '上一集';
    nextTrackBtn.textContent = '下一集';
    prevTrackBtn.title = '上一集';
    nextTrackBtn.title = '下一集';
    const currentPageIndex = videoData?.pages.findIndex(page => page.cid === videoData?.cid) ?? -1;
    prevTrackBtn.disabled = currentPageIndex <= 0;
    nextTrackBtn.disabled = !videoData || currentPageIndex < 0 || currentPageIndex >= videoData.pages.length - 1;
  }

  function updatePlaylistUI() {
    if (isPlaylistMode && currentPlaylistName && currentPlaylist) {
      playlistInfoDiv.style.display = 'block';
      playlistNameEl.textContent = `播放列表: ${currentPlaylistName}`;
      playlistTrackIndicatorEl.textContent = `曲目 ${currentTrackIndex + 1} / ${currentPlaylist.length}`;
    } else {
      playlistInfoDiv.style.display = 'none';
    }
    updateNavigationControls();
  }

  // --- Custom Modal Functions ---
  let currentConfirmCallback: (() => void) | null = null;
  let currentCancelCallback: (() => void) | null = null;
  let currentPlaylistSelectionCallback: ((playlist: Playlist | null) => void) | null = null;
  let selectedPlaylistForModal: Playlist | null = null;

  function showModal(isPlaylistMode: boolean) {
    modalMessageText.style.display = isPlaylistMode ? 'none' : 'block';
    modalPlaylistList.style.display = isPlaylistMode ? 'block' : 'none';
    customModalOverlay.style.display = 'flex';
  }

  function hideModal() {
    customModalOverlay.style.display = 'none';
    modalPlaylistList.innerHTML = ''; // Clear list items
    modalMessageText.textContent = '';
    // Event listeners for confirm/cancel are persistent, so they don't need to be removed here.
    // Only callbacks need to be cleared.
    // modalConfirmBtn.removeEventListener('click', handleConfirmClick);
    // modalCancelBtn.removeEventListener('click', handleCancelClick);

    // Clear callbacks
    currentConfirmCallback = null;
    currentCancelCallback = null;
    currentPlaylistSelectionCallback = null;
    selectedPlaylistForModal = null;
  }

  function handleConfirmClick() {
    if (currentPlaylistSelectionCallback) {
      currentPlaylistSelectionCallback(selectedPlaylistForModal);
    } else if (currentConfirmCallback) {
      currentConfirmCallback();
    }
    hideModal();
  }

  function handleCancelClick() {
    if (currentPlaylistSelectionCallback) {
      currentPlaylistSelectionCallback(null); // Pass null for cancellation
    } else if (currentCancelCallback) {
      currentCancelCallback();
    }
    hideModal();
  }

  modalConfirmBtn.addEventListener('click', handleConfirmClick);
  modalCancelBtn.addEventListener('click', handleCancelClick);

  // Function to show a confirmation dialog
  function showConfirmationModal(
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    title: string = "请确认",
    confirmText: string = "确定",
    cancelText: string = "取消"
  ) {
    modalTitle.textContent = title;
    modalMessageText.textContent = message;
    modalConfirmBtn.textContent = confirmText;
    modalCancelBtn.textContent = cancelText;

    currentConfirmCallback = onConfirm;
    currentCancelCallback = onCancel || (() => {}); // Default to no-op if not provided
    currentPlaylistSelectionCallback = null; // Not a playlist selection

    showModal(false); // false for !isPlaylistMode (i.e. show message, not list)
  }

  // Function to show playlist selection dialog
  function showPlaylistSelectionModal(
    playlists: Playlist[],
    onSelect: (playlist: Playlist | null) => void
  ) {
    modalTitle.textContent = "选择播放合集";
    modalPlaylistList.innerHTML = ''; // Clear previous items
    selectedPlaylistForModal = null; // Reset selection

    if (playlists.length === 0) {
      // This case should ideally be handled before calling, but as a fallback:
      modalMessageText.textContent = "没有可用的播放合集。请先创建。";
      modalPlaylistList.style.display = 'none';
      modalConfirmBtn.style.display = 'none'; // No confirm if no playlists
      modalCancelBtn.textContent = "关闭";
    } else {
      playlists.forEach(playlist => {
        const li = document.createElement('li');
        li.className = 'modal-list-item';
        li.textContent = playlist.name;
        li.dataset.playlistId = playlist.id;
        li.addEventListener('click', () => {
          // Remove 'selected' from previously selected item
          const currentSelected = modalPlaylistList.querySelector('.selected');
          if (currentSelected) currentSelected.classList.remove('selected');
          // Add 'selected' to clicked item
          li.classList.add('selected');
          selectedPlaylistForModal = playlist;
        });
        modalPlaylistList.appendChild(li);
      });
      modalConfirmBtn.style.display = 'inline-block';
      modalConfirmBtn.textContent = "确定";
      modalCancelBtn.textContent = "取消";
    }

    currentPlaylistSelectionCallback = onSelect;
    currentConfirmCallback = null;
    currentCancelCallback = () => onSelect(null); // Ensure cancel calls onSelect(null)

    showModal(true); // true for isPlaylistMode (i.e. show list)
  }
  // --- End Custom Modal Functions ---

  initializeCustomControls();
  updateNavigationControls();
  void loadPlaybackRate();

});
