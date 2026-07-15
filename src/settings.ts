// Settings page script
import { Playlist, PlaylistItem } from "./utils/playlistTypes"; // 1. Import Playlist Types
import { extractVideoId } from "./utils/util";
import { requestBilibiliAudio } from "./utils/runtimeApi";
import { getPlaybackHistory, getUserPlaylists } from './utils/storage';
import { HistoryItem, BilibiliVideoInfo } from "./utils/types";

// Define BilibiliVideoInfo interface (mirroring from other files, ideally shared)

// Define AuthConfig interface (mirroring from other files, ideally shared)

document.addEventListener("DOMContentLoaded", async () => {
  const statusDiv = document.getElementById("status") as HTMLDivElement;

  // Playlist Management DOM Elements (2)
  const newPlaylistNameInput = document.getElementById(
    "new-playlist-name"
  ) as HTMLInputElement;
  const createPlaylistBtn = document.getElementById(
    "create-playlist-btn"
  ) as HTMLButtonElement;
  const playlistListContainer = document.getElementById(
    "playlist-list-container"
  ) as HTMLDivElement;
  const playlistManagementSection = playlistListContainer
    ? (playlistListContainer.parentElement as HTMLDivElement)
    : null; // Assuming .section-container

  // Playlist Items View DOM Elements (1)
  const playlistItemsView = document.getElementById(
    "playlist-items-view"
  ) as HTMLDivElement;
  const playlistItemsTitle = document.getElementById(
    "playlist-items-title"
  ) as HTMLHeadingElement;
  const backToPlaylistsBtn = document.getElementById(
    "back-to-playlists-btn"
  ) as HTMLButtonElement;
  const playlistItemsList = document.getElementById(
    "playlist-items-list"
  ) as HTMLUListElement;

  // Full History DOM Elements
  const fullHistoryListEl = document.getElementById('full-history-list') as HTMLUListElement;
  const noFullHistoryMessageEl = document.getElementById('no-full-history-message') as HTMLParagraphElement;
  const clearFullHistoryBtn = document.getElementById('clear-full-history-btn') as HTMLButtonElement; // 新增清空历史按钮

  // DOM elements for adding video to playlist (within items view)
  const addVideoUrlInput = document.getElementById('add-video-url-input') as HTMLInputElement;
  const addVideoToPlaylistBtn = document.getElementById('add-video-to-playlist-btn') as HTMLButtonElement;

  let currentEditingPlaylistId: string | null = null; // To store the ID of the playlist being viewed/edited

  // Copied from popup.ts (or should be from a shared util)
  function formatRelativeTime(isoTimestamp: string): string {
      const now = new Date();
      const past = new Date(isoTimestamp);
      const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
      const units: { name: string, seconds: number }[] = [
          { name: '年', seconds: 31536000 }, { name: '月', seconds: 2592000 },
          { name: '天', seconds: 86400 }, { name: '小时', seconds: 3600 },
          { name: '分钟', seconds: 60 },
      ];
      for (const unit of units) {
          const interval = Math.floor(diffInSeconds / unit.seconds);
          if (interval >= 1) return `${interval} ${unit.name}前`;
      }
      return '刚刚';
  }

  // --- Utility to show status messages ---
  function showStatus(message: string, type: 'success' | 'error' | 'info', duration: number = 3000) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    if (duration > 0) {
        setTimeout(() => {
            if (statusDiv.textContent === message) { // Avoid clearing a newer message
                statusDiv.style.display = 'none';
                statusDiv.textContent = '';
                statusDiv.className = 'status';
            }
        }, duration);
    }
  }

  // --- Playlist Management ---

  // Helper to fetch fresh video info via Background script
  async function fetchFreshVideoInfoFromBackground(bvid: string, cidGiven?: string): Promise<BilibiliVideoInfo | null> {
    return requestBilibiliAudio(`https://www.bilibili.com/video/${bvid}`, cidGiven);
  }

  // Refactored function to open/send data to player window
  // This is a simplified version based on popup.ts's logic
  async function openOrUpdatePlayerWindow(videoData: BilibiliVideoInfo) {
    const playerUrl = chrome.runtime.getURL("player.html");
    let existingPlayerWindow: chrome.windows.Window | undefined = undefined;
    let playerTabId: number | undefined = undefined;

    try {
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
      existingPlayerWindow = windows.find(win => 
        win.tabs?.some(tab =>
          (tab.url === playerUrl || tab.url?.startsWith(`${playerUrl}?`)) && tab.id !== undefined
        )
      );
      if (existingPlayerWindow) {
        playerTabId = existingPlayerWindow.tabs?.find(tab =>
          tab.url === playerUrl || tab.url?.startsWith(`${playerUrl}?`)
        )?.id;
      }
    } catch (error) {
      console.error("Error searching for existing player window:", error);
    }

    if (existingPlayerWindow && playerTabId) {
      try {
        await chrome.windows.update(existingPlayerWindow.id!, { focused: true });
        await chrome.tabs.sendMessage(playerTabId, { action: "playAudio", data: videoData });
        await chrome.storage.local.set({ activePlayerWindowId: existingPlayerWindow.id });
        showStatus('已发送到播放器。', 'success');
      } catch (error) {
        console.error("Error reusing existing player window:", error);
        await chrome.storage.local.remove("activePlayerWindowId");
        _createNewPlayerViaMessage(videoData, playerUrl);
      }
    } else {
      _createNewPlayerViaMessage(videoData, playerUrl);
    }
  }

  function _createNewPlayerViaMessage(videoData: BilibiliVideoInfo, playerUrl: string) {
    chrome.windows.create(
      { url: playerUrl, type: "popup", width: 400, height: 600 },
      async (window) => {
        if (window && window.tabs && window.tabs[0] && window.tabs[0].id) {
          const tabId = window.tabs[0].id;
          await chrome.storage.local.set({ activePlayerWindowId: window.id });
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: "playAudio", data: videoData }, () => {
              if (chrome.runtime.lastError) {
                console.error("Error sending playAudio message to new window:", chrome.runtime.lastError.message);
                showStatus('播放器通信错误', 'error');
              } else {
                showStatus('已发送到新播放器。', 'success');
              }
            });
          }, 500); 
        } else {
          showStatus('无法创建播放器窗口。', 'error');
        }
      }
    );
  }

  // 3. loadPlaylists Function
  async function loadPlaylists() {
    try {
      const playlists = await getUserPlaylists();
      renderPlaylists(playlists);
    } catch (error) {
      console.error('Error loading playlists:', error);
      showStatus('加载播放合集失败。', 'error');
      renderPlaylists([]); // Render empty state
    }
  }

  // 4. renderPlaylists Function
  function renderPlaylists(playlists: Playlist[]) {
    playlistListContainer.innerHTML = ''; // Clear existing content

    if (!playlists || playlists.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = '暂无播放合集。';
      emptyMessage.className = 'empty-message';
      playlistListContainer.appendChild(emptyMessage);
      return;
    }

    const ul = document.createElement('ul');
    playlists.forEach(playlist => {
      const li = document.createElement('li');
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'playlist-name';
      nameSpan.textContent = playlist.name;
      nameSpan.title = playlist.name; // Set title attribute for full name on hover
      nameSpan.addEventListener('click', () => { 
        displayPlaylistItems(playlist.id);
      });
      li.appendChild(nameSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'playlist-actions';

      const renameBtn = document.createElement('button');
      renameBtn.textContent = '重命名';
      renameBtn.className = 'rename-playlist-btn';
      renameBtn.dataset.playlistId = playlist.id;
      renameBtn.addEventListener('click', () => _renamePlaylist(playlist.id, playlist.name)); // Corrected: Wrapped in arrow function
      actionsDiv.appendChild(renameBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.className = 'delete-playlist-btn';
      deleteBtn.dataset.playlistId = playlist.id;
      deleteBtn.addEventListener('click', () => _deletePlaylist(playlist.id)); // Corrected: Wrapped in arrow function
      actionsDiv.appendChild(deleteBtn);
      
      li.appendChild(actionsDiv);
      ul.appendChild(li);
    });
    playlistListContainer.appendChild(ul);
  }

  // 5. Create Playlist Functionality
  createPlaylistBtn.addEventListener('click', async () => {
    const name = newPlaylistNameInput.value.trim();
    if (!name) {
      showStatus('请输入播放合集名称。', 'error');
      return;
    }

    try {
      const playlists = await getUserPlaylists();

      // Check for duplicate names
      if (playlists.some(p => p.name === name)) {
        showStatus('已存在同名播放合集。', 'error');
        return;
      }

      const newPlaylist: Playlist = {
        id: Date.now().toString(), // Simple unique ID
        name: name,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      playlists.push(newPlaylist);
      await chrome.storage.local.set({ userPlaylists: playlists });
      
      newPlaylistNameInput.value = ''; // Clear input
      showStatus(`播放合集 \"${name}\" 创建成功！`, 'success');
      await loadPlaylists(); // Refresh list
    } catch (error) {
      console.error('Error creating playlist:', error);
      showStatus('创建播放合集失败。', 'error');
    }
  });

  // 6. Delete Playlist Functionality
  async function _deletePlaylist(playlistId: string) {
    if (!confirm("确定要删除这个播放合集吗？其包含的所有歌曲信息也将被移除。")) {
      return;
    }
    try {
      let playlists = await getUserPlaylists();
      playlists = playlists.filter(p => p.id !== playlistId);
      await chrome.storage.local.set({ userPlaylists: playlists });
      showStatus('播放合集已删除。', 'success');
      await loadPlaylists();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      showStatus('删除播放合集失败。', 'error');
    }
  }

  // 7. Rename Playlist Functionality
  async function _renamePlaylist(playlistId: string, currentName: string) {
    const newName = prompt("请输入新的播放合集名称：", currentName);
    if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
      try {
        const playlists = await getUserPlaylists();
        
        // Check for duplicate names (excluding the current playlist being renamed)
        if (playlists.some(p => p.name === newName.trim() && p.id !== playlistId)) {
          showStatus('已存在其他同名播放合集。', 'error');
          return;
        }

        const playlistIndex = playlists.findIndex(p => p.id === playlistId);
        if (playlistIndex > -1) {
          playlists[playlistIndex].name = newName.trim();
          playlists[playlistIndex].updatedAt = new Date().toISOString();
          await chrome.storage.local.set({ userPlaylists: playlists });
          showStatus('播放合集已重命名。', 'success');
          await loadPlaylists();
        }
      } catch (error) {
        console.error('Error renaming playlist:', error);
        showStatus('重命名播放合集失败。', 'error');
      }
    } else if (newName === null) {
      // User cancelled prompt, do nothing
    } else {
      showStatus('名称无效或未更改。', 'error');
    }
  }

  // 8. Initial Load for playlists
  loadPlaylists();

  // --- Playlist Items View Logic --- (2)

  // View State Management
  function showPlaylistListView() {
    if (playlistManagementSection) { // Show the main playlist creation/list section
        // Find direct children of container that are form-group or playlist-list-container for playlist creation/listing
        Array.from(playlistManagementSection.children).forEach(child => {
            if (child.id === 'playlist-list-container' || 
                child.classList.contains('form-group') || // for new playlist input
                child === createPlaylistBtn) { // for create button
                 (child as HTMLElement).style.display = '';
            }
        });
    }
    if (playlistItemsView) playlistItemsView.style.display = 'none';
  }

  function showItemsView() {
     if (playlistManagementSection) { // Hide the main playlist creation/list section elements
        Array.from(playlistManagementSection.children).forEach(child => {
            if (child.id === 'playlist-list-container' || 
                child.classList.contains('form-group') || // for new playlist input
                child === createPlaylistBtn) { // for create button
                (child as HTMLElement).style.display = 'none';
            }
        });
    }
    if (playlistItemsView) playlistItemsView.style.display = 'block';
  }

  // Back to Playlists button (7)
  backToPlaylistsBtn.addEventListener('click', showPlaylistListView);
  
  // displayPlaylistItems Function (3)
  async function displayPlaylistItems(playlistId: string) {
    currentEditingPlaylistId = playlistId; // Store the current playlist ID
    try {
      const playlists = await getUserPlaylists();
      const playlist = playlists.find(p => p.id === playlistId);

      if (!playlist) {
        showStatus('无法找到播放合集。', 'error');
        showPlaylistListView(); // Go back to list view if playlist not found
        return;
      }

      playlistItemsTitle.textContent = `播放合集: ${playlist.name}`;
      playlistItemsList.innerHTML = ''; // Clear previous items

      if (playlist.items.length === 0) {
        const noItemsMsg = document.createElement('li');
        noItemsMsg.className = 'no-items-message';
        noItemsMsg.textContent = '此播放合集暂无歌曲。';
        playlistItemsList.appendChild(noItemsMsg);
      } else {
        playlist.items.forEach((item: PlaylistItem) => {
          const li = document.createElement('li');
          
          const itemInfoDiv = document.createElement('div');
          itemInfoDiv.className = 'item-info';
          
          const itemTitleSpan = document.createElement('span');
          itemTitleSpan.className = 'item-title';
          itemTitleSpan.textContent = item.title;
          itemTitleSpan.title = item.title; // Set title attribute for full name on hover
          itemTitleSpan.addEventListener('click', () => _playPlaylistItem(item));
          itemInfoDiv.appendChild(itemTitleSpan);

          if (item.bvid) {
            const itemDetailsSpan = document.createElement('span');
            itemDetailsSpan.className = 'item-details';
            itemDetailsSpan.textContent = ` (BV: ${item.bvid}) - 添加于: ${new Date(item.addedAt).toLocaleDateString()}`;
            itemInfoDiv.appendChild(itemDetailsSpan);
          } else {
            const itemDetailsSpan = document.createElement('span');
            itemDetailsSpan.className = 'item-details';
            itemDetailsSpan.textContent = ` - 添加于: ${new Date(item.addedAt).toLocaleDateString()}`;
            itemInfoDiv.appendChild(itemDetailsSpan);
          }
          li.appendChild(itemInfoDiv);

          const itemActionsDiv = document.createElement('div');
          itemActionsDiv.className = 'item-actions';
          
          const removeBtn = document.createElement('button');
          removeBtn.textContent = '移除';
          removeBtn.className = 'remove-item-btn';
          removeBtn.title = '从此播放合集中移除';
          removeBtn.addEventListener('click', () => _removePlaylistItem(playlist.id, item.id));
          itemActionsDiv.appendChild(removeBtn);
          
          li.appendChild(itemActionsDiv);
          playlistItemsList.appendChild(li);
        });
      }
      showItemsView();
    } catch (error) {
      console.error('Error displaying playlist items:', error);
      showStatus('加载播放合集歌曲失败。', 'error');
      showPlaylistListView();
    }
  }

  // _playPlaylistItem Function (4)
  async function _playPlaylistItem(item: PlaylistItem) {
    showStatus(`正在加载: ${item.title}`, 'info', 0); // Show loading, 0 duration = manual clear or replaced
    const freshInfo = await fetchFreshVideoInfoFromBackground(item.bvid, item.cid);
    if (freshInfo) {
      openOrUpdatePlayerWindow(freshInfo);
      // status message will be handled by openOrUpdatePlayerWindow or if it fails here
    } else {
      showStatus(`无法加载 "${item.title}"。请检查视频是否有效或需要登录。`, "error");
    }
  }

  // _removePlaylistItem Function (6)
  async function _removePlaylistItem(playlistId: string, itemId: string) {
    if (!confirm("确定要从此播放合集中移除这首歌曲吗？")) {
      return;
    }
    try {
      const playlists = await getUserPlaylists();
      const playlistIndex = playlists.findIndex(p => p.id === playlistId);

      if (playlistIndex === -1) {
        showStatus('无法找到播放合集。', 'error');
        return;
      }
      
      const originalItemCount = playlists[playlistIndex].items.length;
      playlists[playlistIndex].items = playlists[playlistIndex].items.filter((item: PlaylistItem) => item.id !== itemId);

      if (playlists[playlistIndex].items.length < originalItemCount) {
        playlists[playlistIndex].updatedAt = new Date().toISOString();
        await chrome.storage.local.set({ userPlaylists: playlists });
        showStatus('歌曲已从播放合集中移除。', 'success');
        // Refresh the current view of items for this playlist
        await displayPlaylistItems(playlistId); 
      } else {
        showStatus('未找到要移除的歌曲，或移除失败。', 'error');
      }
    } catch (error) {
      console.error('Error removing playlist item:', error);
      showStatus('移除歌曲失败。', 'error');
    }
  }

  // --- Full Playback History --- (8)
  async function displayFullPlaybackHistory() {
    if (!fullHistoryListEl || !noFullHistoryMessageEl || !clearFullHistoryBtn) return;

    try {
      const history = await getPlaybackHistory();

      if (history.length === 0) {
        noFullHistoryMessageEl.style.display = "block";
        fullHistoryListEl.style.display = "none";
        clearFullHistoryBtn.style.display = "none";
        return;
      }

      noFullHistoryMessageEl.style.display = "none";
      fullHistoryListEl.style.display = "block";
      clearFullHistoryBtn.style.display = "inline-block"; // Show clear button
      fullHistoryListEl.innerHTML = ""; // Clear previous items

      history.forEach((item) => {
        const li = document.createElement("li");
        li.className = "history-item-full"; // Use a different class if needed for styling

        const titleSpan = document.createElement("span");
        titleSpan.className = "history-title";
        titleSpan.textContent = item.title;
        titleSpan.title = item.title; // Show full title on hover
        // Add click listener to play the history item using the new method
        titleSpan.addEventListener("click", async () => {
          showStatus(`正在加载: ${item.title}`, 'info', 0);
          const freshInfo = await fetchFreshVideoInfoFromBackground(item.bvid, item.cid);
          if (freshInfo) {
            openOrUpdatePlayerWindow(freshInfo);
          } else {
            showStatus(`无法加载 "${item.title}"。请检查视频是否有效或需要登录。`, "error");
          }
        });

        const detailsSpan = document.createElement("span");
        detailsSpan.className = "history-details";
        const bvidText = item.bvid ? ` (BV: ${item.bvid})` : "";
        detailsSpan.textContent = `${bvidText} - ${formatRelativeTime(item.timestamp)}`;

        li.appendChild(titleSpan);
        li.appendChild(detailsSpan);
        fullHistoryListEl.appendChild(li);
      });
    } catch (error) {
      console.error("Error displaying full playback history:", error);
      noFullHistoryMessageEl.textContent = "无法加载播放历史记录。";
      noFullHistoryMessageEl.style.display = "block";
      fullHistoryListEl.style.display = "none";
      clearFullHistoryBtn.style.display = "none";
    }
  }
  
  clearFullHistoryBtn.addEventListener('click', async () => {
    if (confirm("确定要清空所有播放历史记录吗？此操作不可恢复。")) {
        try {
            await chrome.storage.local.remove('playbackHistory');
            showStatus('播放历史已清空。', 'success');
            displayFullPlaybackHistory(); // Refresh the view
        } catch (error) {
            console.error('Error clearing full playback history:', error);
            showStatus('清空播放历史失败。', 'error');
        }
    }
  });

  // Initial call to display history
  displayFullPlaybackHistory();

  // Event listener for adding video to the current playlist
  if (addVideoToPlaylistBtn && addVideoUrlInput) {
    addVideoToPlaylistBtn.addEventListener('click', async () => {
      if (!currentEditingPlaylistId) {
        showStatus('没有选定的播放合集。', 'error');
        return;
      }
      const videoUrl = addVideoUrlInput.value.trim();
      if (!videoUrl) {
        showStatus('请输入视频链接。', 'error');
        return;
      }

      // 1. Validate URL and get BVID (using extractVideoId from bilibiliApi)
      const videoIdParts = extractVideoId(videoUrl); // Now correctly using the imported extractVideoId
      
      if (!videoIdParts || (!videoIdParts.bvid && !videoIdParts.aid)) {
        showStatus('无效的 Bilibili 视频链接或无法提取ID。', 'error');
        return;
      }

      showStatus('正在提取视频信息...', 'info', 0);
      const videoInfo = await requestBilibiliAudio(videoUrl);

      if (!videoInfo || !videoInfo.bvid || !videoInfo.cid) { // Ensure we have bvid and cid
        showStatus('无法获取视频信息，请检查链接或视频是否有效。', 'error');
        return;
      }

      // 2. Add to playlist logic
      try {
        const playlists = await getUserPlaylists();
        const playlistIndex = playlists.findIndex(p => p.id === currentEditingPlaylistId);

        if (playlistIndex === -1) {
          showStatus('发生错误：找不到当前播放合集。', 'error');
          return;
        }

        // Check for duplicates within this playlist
        if (playlists[playlistIndex].items.some(item =>
          item.bvid === videoInfo.bvid && item.cid === videoInfo.cid
        )) {
          showStatus(`视频 "${videoInfo.title}" 已存在于此播放合集中。`, 'error');
          addVideoUrlInput.value = ''; // Clear input
          return;
        }

        const newPlaylistItem: PlaylistItem = {
          id: Date.now().toString(), // Unique ID for playlist item
          title: videoInfo.title,
          bvid: videoInfo.bvid,
          cid: videoInfo.cid,
          // audioUrl is not stored here, will be fetched on demand by player
          addedAt: new Date().toISOString(),
        };

        playlists[playlistIndex].items.push(newPlaylistItem);
        playlists[playlistIndex].updatedAt = new Date().toISOString();

        await chrome.storage.local.set({ userPlaylists: playlists });
        showStatus(`"${videoInfo.title}" 已添加到播放合集！`, 'success');
        addVideoUrlInput.value = ''; // Clear input
        await displayPlaylistItems(currentEditingPlaylistId); // Refresh items view
      } catch (error) {
        console.error('Error adding video to playlist:', error);
        showStatus('添加视频到播放合集失败。', 'error');
      }
    });
  }
});
