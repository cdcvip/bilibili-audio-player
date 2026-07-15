/// <reference types="chrome" />
// Popup page script
import { isBilibiliVideoPage } from "./utils/util";
import { requestBilibiliAudio } from "./utils/runtimeApi";
import { getPlaybackHistory, getUserPlaylists } from './utils/storage';
import { Playlist } from "./utils/playlistTypes"; // Import Playlist type
import { HistoryItem, BilibiliVideoInfo } from "./utils/types"; // Import shared types

document.addEventListener("DOMContentLoaded", async () => {
  const videoUrlInput = document.getElementById(
    "video-url"
  ) as HTMLInputElement;
  const extractBtn = document.getElementById(
    "extract-btn"
  ) as HTMLButtonElement;
  const statusDiv = document.getElementById("status") as HTMLDivElement;
  const currentVideoInfo = document.getElementById(
    "current-video-info"
  ) as HTMLDivElement;
  const videoTitle = document.getElementById("video-title") as HTMLDivElement;
  const playCurrentBtn = document.getElementById(
    "play-current-btn"
  ) as HTMLButtonElement;
  const historyList = document.getElementById(
    "history-list"
  ) as HTMLUListElement;
  const moreHistoryBtn = document.getElementById(
    "more-history-btn"
  ) as HTMLButtonElement; // Added
  const collectionList = document.getElementById(
    "collection-list"
  ) as HTMLUListElement; // Added

  let currentTabUrl = "";
  let currentVideoData: BilibiliVideoInfo | null = null; // Use imported BilibiliVideoInfo

  // Helper function to format ISO date string to relative time
  function formatRelativeTime(isoTimestamp: string): string {
    const now = new Date();
    const past = new Date(isoTimestamp);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    const units: { name: string; seconds: number }[] = [
      { name: "年", seconds: 31536000 },
      { name: "月", seconds: 2592000 },
      { name: "天", seconds: 86400 },
      { name: "小时", seconds: 3600 },
      { name: "分钟", seconds: 60 },
    ];

    for (const unit of units) {
      const interval = Math.floor(diffInSeconds / unit.seconds);
      if (interval >= 1) {
        return `${interval} ${unit.name}前`;
      }
    }
    return "刚刚";
  }

  // Check if current tab is a Bilibili video page
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      currentTabUrl = tabs[0].url;

      if (isBilibiliVideoPage(currentTabUrl)) {
        // Pre-fill the input with current tab URL
        videoUrlInput.value = currentTabUrl;

        // Try to extract info from current page
        await extractVideoInfo(currentTabUrl, true);
      }
    }
  } catch (error) {
    console.error("Error checking current tab:", error);
  }

  // Extract button click handler
  extractBtn.addEventListener("click", async () => {
    const url = videoUrlInput.value.trim();
    if (!url) {
      showStatus("请输入 Bilibili 视频链接", "error");
      return;
    }

    await extractVideoInfo(url);
  });

  // Play current video button click handler
  playCurrentBtn.addEventListener("click", async () => {
    if (currentVideoData) {
      openPlayerWindow(currentVideoData);
    }
  });

  // Function to extract video info and show status
  async function extractVideoInfo(url: string, isCurrentTab = false) {
    try {
      // Show loading state
      extractBtn.disabled = true;
      extractBtn.innerHTML = '<span class="loading"></span>提取中...';
      showStatus("正在提取音频信息...", "info");

      // Cookie access and API requests are isolated in the background worker.
      const videoInfo = await requestBilibiliAudio(url);

      if (!videoInfo) {
        throw new Error("无法提取音频信息，请检查链接或登录状态");
      }

      // Store current video data
      currentVideoData = videoInfo;

      if (isCurrentTab) {
        // Show current video info section
        currentVideoInfo.style.display = "block";
        videoTitle.textContent = videoInfo.title;
      } else {
        // Open player window directly
        openPlayerWindow(videoInfo);
        showStatus("音频提取成功！正在打开播放器...", "success");
      }
    } catch (error) {
      console.error("Error extracting video info:", error);
      showStatus(
        (error as Error).message || "提取失败，请检查链接或网络连接",
        "error"
      );
    } finally {
      // Reset button state
      extractBtn.disabled = false;
      extractBtn.textContent = "提取并播放音频";
    }
  }

  // Function to open player window
  async function openPlayerWindow(videoData: BilibiliVideoInfo) { // Use imported BilibiliVideoInfo
    const playerUrl = chrome.runtime.getURL("player.html");
    let existingPlayerWindow: chrome.windows.Window | undefined = undefined;
    let playerTabId: number | undefined = undefined;

    try {
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
      for (const win of windows) {
        if (win.tabs) {
          const playerTab = win.tabs.find(tab =>
            tab.url === playerUrl || tab.url?.startsWith(`${playerUrl}?`)
          );
          if (playerTab && win.id) {
            existingPlayerWindow = win;
            playerTabId = playerTab.id;
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error searching for existing player window:", error);
      // Proceed to create a new window if search fails
    }

    if (existingPlayerWindow && playerTabId) {
      try {
        await chrome.windows.update(existingPlayerWindow.id!, { focused: true });
        await chrome.tabs.sendMessage(playerTabId, {
          action: "playAudio",
          data: videoData,
        });
        // Store/update the window ID
        await chrome.storage.local.set({ activePlayerWindowId: existingPlayerWindow.id });
        // console.log("Reused existing player window:", existingPlayerWindow.id);
      } catch (error) {
        console.error("Error reusing existing player window:", error);
        // If there's an error (e.g., window was closed), clear the stored ID and create a new one.
        await chrome.storage.local.remove("activePlayerWindowId");
        createNewPlayerWindow(videoData, playerUrl);
      }
    } else {
      createNewPlayerWindow(videoData, playerUrl);
    }
  }

  // Helper function to create a new player window
  function createNewPlayerWindow(videoData: BilibiliVideoInfo, playerUrl: string) { // Use imported BilibiliVideoInfo
    chrome.windows.create(
      {
        url: playerUrl,
        type: "popup",
        width: 400,
        height: 600,
      },
      async (window) => {
        if (window && window.tabs && window.tabs[0] && window.tabs[0].id) {
          const tabId = window.tabs[0].id;
          // Store the new window ID
          await chrome.storage.local.set({ activePlayerWindowId: window.id });
          // console.log("Created new player window:", window.id);

          // Wait for the player window to load
          setTimeout(() => {
            chrome.tabs.sendMessage(
              tabId,
              {
                action: "playAudio",
                data: videoData,
              }
            );
          }, 500); // Keep timeout for new window script loading
        } else {
          console.error("Could not get tab ID for the new player window.");
          showStatus("Failed to open player window.", "error");
        }
      }
    );
  }

  // Function to show status message
  function showStatus(message: string, type: "success" | "error" | "info") {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    // Clear message after a delay, but not for errors that need user attention
    if (type === "success" || type === "info") {
      setTimeout(() => {
        // Check if the message is still the one we set, to avoid clearing a new message
        if (statusDiv.textContent === message) {
            statusDiv.textContent = "";
            statusDiv.className = "status";
            statusDiv.style.display = "none"; // Hide it again if it was only info/success
        }
      }, 3000);
    } else if (type === "error") {
        statusDiv.style.display = "block"; // Ensure errors are visible
    }
  }

  // --- Helper to fetch fresh video info via Background --- 
  async function fetchFreshVideoInfoFromBackground(bvid: string, cid?: string): Promise<BilibiliVideoInfo | null> {
    return requestBilibiliAudio(`https://www.bilibili.com/video/${bvid}`, cid);
  }

  // --- Playback History Functions ---

  // Function to display playback history
  async function displayPlaybackHistory() {
    if (!historyList) return; // Should not happen if HTML is correct

    historyList.innerHTML = ""; // Clear previous items

    try {
      const history = await getPlaybackHistory();

      if (history.length === 0) {
        const noHistoryLi = document.createElement("li");
        noHistoryLi.textContent = "暂无播放历史";
        noHistoryLi.className = "no-history";
        historyList.appendChild(noHistoryLi);
        if (moreHistoryBtn) moreHistoryBtn.style.display = "none"; // Ensure "More" button is hidden
        return;
      }

      const historyLimit = 6;
      const itemsToDisplay = history.slice(0, historyLimit);

      itemsToDisplay.forEach((item) => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.dataset.title = item.title;
        if (item.bvid) {
          li.dataset.bvid = item.bvid;
        }

        const titleSpan = document.createElement("span");
        titleSpan.className = "history-title";
        titleSpan.textContent = item.title;
        titleSpan.title = item.title; // Show full title on hover

        const timestampSpan = document.createElement("span");
        timestampSpan.className = "history-timestamp";
        timestampSpan.textContent = formatRelativeTime(item.timestamp);

        li.appendChild(titleSpan);
        li.appendChild(timestampSpan);

        li.addEventListener("click", async () => {
          showStatus(`正在加载: ${item.title}`, "info");
          const freshInfo = await fetchFreshVideoInfoFromBackground(item.bvid, item.cid);
          if (freshInfo) {
            openPlayerWindow(freshInfo);
            // showStatus("已发送到播放器!", "success"); // openPlayerWindow handles its own status
          } else {
            showStatus(`无法加载 "${item.title}"。请检查视频是否有效或需要登录。`, "error");
          }
        });
        historyList.appendChild(li);
      });

      if (history.length > historyLimit) {
        if (moreHistoryBtn) moreHistoryBtn.style.display = "inline-block";
      } else {
        if (moreHistoryBtn) moreHistoryBtn.style.display = "none";
      }
    } catch (error) {
      console.error("Error displaying playback history:", error);
      const errorLi = document.createElement("li");
      errorLi.textContent = "无法加载播放历史";
      errorLi.className = "error"; // You might want to style this
      historyList.appendChild(errorLi);
    }
  }

  // --- Collections Functions ---
  async function displayCollections() {
    if (!collectionList) return;

    collectionList.innerHTML = ""; // Clear previous items

    try {
      const playlists = await getUserPlaylists();

      if (playlists.length === 0) {
        const noCollectionsLi = document.createElement("li");
        noCollectionsLi.textContent = "暂无播放合集";
        noCollectionsLi.className = "no-collections";
        collectionList.appendChild(noCollectionsLi);
        return;
      }

      playlists.forEach((playlist) => {
        const li = document.createElement("li");
        li.className = "collection-item";
        li.dataset.playlistId = playlist.id;

        const titleSpan = document.createElement("span");
        titleSpan.className = "collection-title";
        titleSpan.textContent = playlist.name;
        titleSpan.title = playlist.name; // Show full title on hover

        const timestampSpan = document.createElement("span");
        timestampSpan.className = "collection-timestamp";
        timestampSpan.textContent = formatRelativeTime(playlist.updatedAt);

        li.appendChild(titleSpan);
        li.appendChild(timestampSpan);

        li.addEventListener("click", async () => {
          const playlistId = li.dataset.playlistId;
          if (!playlistId) {
            console.error("Playlist ID not found on clicked item.");
            showStatus("Cannot play: playlist ID missing.", "error");
            return;
          }

          try {
            const playlists = await getUserPlaylists();
            const selectedPlaylist = playlists.find((p) => p.id === playlistId);

            if (selectedPlaylist) {
              if (selectedPlaylist.items && selectedPlaylist.items.length > 0) {
                // For playing a playlist, player.ts now handles fetching fresh URLs for each item.
                // So, popup.ts just needs to send the playlist (with bvid/cid for each item).
                // No need to pre-fetch all URLs here; player.ts does it one-by-one.
                openPlayerWindowForPlaylist(selectedPlaylist, 0); 
              } else {
                showStatus(
                  `Collection "${selectedPlaylist.name}" is empty. Add songs in Settings.`,
                  "error"
                );
              }
            } else {
              showStatus(
                "Could not find the selected collection. It might have been deleted.",
                "error"
              );
              // Optionally, refresh the collections list here:
              // displayCollections();
            }
          } catch (error) {
            console.error("Error handling playlist click:", error);
            showStatus("Failed to load and play collection.", "error");
          }
        });
        collectionList.appendChild(li);
      });
    } catch (error) {
      console.error("Error displaying collections:", error);
      const errorLi = document.createElement("li");
      errorLi.textContent = "无法加载播放合集";
      errorLi.className = "error";
      collectionList.appendChild(errorLi);
    }
  }

  if (moreHistoryBtn) {
    moreHistoryBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage(); // This opens settings.html
    });
  }

  // Initial call to display history
  displayPlaybackHistory();
  displayCollections(); // Added

  async function openPlayerWindowForPlaylist(
    playlist: Playlist, // Playlist items now have bvid/cid, audioUrl is optional
    startIndex: number = 0
  ) {
    const playerUrl = chrome.runtime.getURL("player.html");
    let existingPlayerWindow: chrome.windows.Window | undefined = undefined;
    let playerTabId: number | undefined = undefined;

    try {
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["popup", "normal"] });
      for (const win of windows) {
        if (win.tabs) {
          const playerTab = win.tabs.find(tab =>
            tab.url === playerUrl || tab.url?.startsWith(`${playerUrl}?`)
          );
          if (playerTab && win.id) {
            existingPlayerWindow = win;
            playerTabId = playerTab.id;
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error searching for existing player window for playlist:", error);
    }

    const messagePayload = {
      action: "playPlaylist",
      data: {
        playlist: playlist,
        startIndex: startIndex,
      },
    };

    if (existingPlayerWindow && playerTabId) {
      try {
        await chrome.windows.update(existingPlayerWindow.id!, { focused: true });
        await chrome.tabs.sendMessage(playerTabId, messagePayload);
        await chrome.storage.local.set({ activePlayerWindowId: existingPlayerWindow.id });
        // console.log("Reused existing player window for playlist:", existingPlayerWindow.id);
      } catch (error) {
        console.error("Error reusing existing player window for playlist:", error);
        await chrome.storage.local.remove("activePlayerWindowId");
        createNewPlayerWindowForPlaylist(playlist, startIndex, playerUrl, messagePayload);
      }
    } else {
      createNewPlayerWindowForPlaylist(playlist, startIndex, playerUrl, messagePayload);
    }
  }

  function createNewPlayerWindowForPlaylist(
    playlist: Playlist,
    startIndex: number,
    playerUrl: string,
    messagePayload: any // Re-pass payload to avoid reconstruction
  ) {
    chrome.windows.create(
      {
        url: playerUrl, // Use the passed playerUrl
        type: "popup",
        width: 420,
        height: 620,
      },
      async (window) => {
        if (window && window.tabs && window.tabs[0] && window.tabs[0].id) {
          const tabId = window.tabs[0].id;
          await chrome.storage.local.set({ activePlayerWindowId: window.id });
          // console.log("Created new player window for playlist:", window.id);

          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, messagePayload, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Error sending playPlaylist message to new window:",
                  chrome.runtime.lastError.message
                );
              }
            });
          }, 500);
        } else {
          console.error("Could not get tab ID for the new player window for playlist.");
          // Optional: showStatus("Failed to open player window for playlist.", "error");
        }
      }
    );
  }
});
