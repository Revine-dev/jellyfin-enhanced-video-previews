/**
 * Enhanced Video Previews for Jellyfin Web
 * Plays video previews on hover over media cards and list items.
 *
 * Adapted from the original injection mod by bobhasnosoul:
 * https://github.com/bobhasnosoul/jellyfin-video-previews
 */
(function () {
  'use strict';

  if (window.__enhancedVideoPreviewsLoaded) {
    return;
  }
  window.__enhancedVideoPreviewsLoaded = true;

  const PLUGIN_ID = '8a9e2d4f-5b12-4c6e-9a8f-12014f3a9e12';

  // Default configuration
  let config = {
    enabled: true,
    previewStartTime: 840,
    playbackSpeed: 1.0,
    hoverDelay: 150,
    transcodeWidth: 360,
    muteAudio: true,
    loopPreview: true,
    preferDirectStream: true,
    fallbackToTranscoding: true,
  };

  // State
  let currentHoverTarget = null;
  let activePreviewContainer = null;
  let activeVideoElement = null;
  let activeOverlay = null;
  let hoverTimeout = null;
  let activeSessionId = 0;

  // Cache for resolved playable items: itemId -> { videoId, durationSeconds }
  const itemCache = new Map();
  const MAX_CACHE_ENTRIES = 120;

  const getBaseUrl = () => {
    if (window.ApiClient && typeof window.ApiClient.serverAddress === 'function') {
      const addr = window.ApiClient.serverAddress();
      if (addr) return addr.replace(/\/+$/, '');
    }
    const path = window.location.pathname;
    const subPath = path.includes('/web') ? path.substring(0, path.indexOf('/web')) : '';
    return (window.location.origin + subPath).replace(/\/+$/, '');
  };

  const getCredentials = () => {
    if (window.ApiClient) {
      const token = typeof window.ApiClient.accessToken === 'function' ? window.ApiClient.accessToken() : null;
      const userId = typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : null;
      if (token) {
        return { token, userId };
      }
    }

    const creds = localStorage.getItem('jellyfin_credentials');
    if (!creds) return null;
    try {
      const parsed = JSON.parse(creds);
      const server = parsed.Servers && parsed.Servers[0];
      if (server) {
        return { token: server.AccessToken, userId: server.UserId };
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  };

  const loadServerConfig = async () => {
    try {
      if (window.ApiClient && typeof window.ApiClient.getPluginConfiguration === 'function') {
        const remoteConfig = await window.ApiClient.getPluginConfiguration(PLUGIN_ID);
        if (remoteConfig) {
          config.enabled = remoteConfig.Enabled !== undefined ? remoteConfig.Enabled : config.enabled;
          config.previewStartTime = remoteConfig.PreviewStartTime !== undefined ? remoteConfig.PreviewStartTime : config.previewStartTime;
          config.playbackSpeed = remoteConfig.PlaybackSpeed !== undefined ? remoteConfig.PlaybackSpeed : config.playbackSpeed;
          config.hoverDelay = remoteConfig.HoverDelay !== undefined ? remoteConfig.HoverDelay : config.hoverDelay;
          config.transcodeWidth = remoteConfig.TranscodeWidth !== undefined ? remoteConfig.TranscodeWidth : config.transcodeWidth;
          config.muteAudio = remoteConfig.MuteAudio !== undefined ? remoteConfig.MuteAudio : config.muteAudio;
          config.loopPreview = remoteConfig.LoopPreview !== undefined ? remoteConfig.LoopPreview : config.loopPreview;
          config.preferDirectStream = remoteConfig.PreferDirectStream !== undefined ? remoteConfig.PreferDirectStream : config.preferDirectStream;
          config.fallbackToTranscoding = remoteConfig.FallbackToTranscoding !== undefined ? remoteConfig.FallbackToTranscoding : config.fallbackToTranscoding;
        }
      }
    } catch {
      // Fallback silently to defaults
    }
  };

  const clearPreview = () => {
    activeSessionId++;
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }

    if (activeVideoElement) {
      try {
        activeVideoElement.pause();
        activeVideoElement.removeAttribute('src');
        activeVideoElement.load();
      } catch {
        // Ignore abort errors
      }
      activeVideoElement = null;
    }

    if (activeOverlay) {
      try {
        activeOverlay.style.opacity = '0';
        activeOverlay.remove();
      } catch {
        // Ignore removal error
      }
      activeOverlay = null;
    }

    currentHoverTarget = null;
    activePreviewContainer = null;
  };

  const resolvePlayableItem = async (itemId, creds, baseUrl) => {
    if (itemCache.has(itemId)) {
      return itemCache.get(itemId);
    }

    try {
      const itemUrl = creds.userId
        ? `${baseUrl}/Users/${creds.userId}/Items/${itemId}?api_key=${creds.token}`
        : `${baseUrl}/Items/${itemId}?api_key=${creds.token}`;

      const resp = await fetch(itemUrl);
      if (!resp.ok) {
        return null;
      }

      const item = await resp.json();
      let videoId = itemId;
      let durationSeconds = item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000000) : 0;

      // Handle Series, Season, or Collection by querying the first playable episode/video
      if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'BoxSet') {
        const queryParams = new URLSearchParams({
          parentId: itemId,
          recursive: 'true',
          includeItemTypes: item.Type === 'BoxSet' ? 'Movie,Episode,Video' : 'Episode',
          sortBy: 'IndexNumber,SortName',
          sortOrder: 'Ascending',
          limit: '1',
          api_key: creds.token,
        });

        const queryUrl = creds.userId
          ? `${baseUrl}/Users/${creds.userId}/Items?${queryParams.toString()}`
          : `${baseUrl}/Items?${queryParams.toString()}`;

        const itemsResp = await fetch(queryUrl);
        if (itemsResp.ok) {
          const list = await itemsResp.json();
          if (list.Items && list.Items.length > 0) {
            const first = list.Items[0];
            videoId = first.Id;
            durationSeconds = first.RunTimeTicks ? Math.floor(first.RunTimeTicks / 10000000) : 0;
          } else {
            return null;
          }
        }
      }

      const result = { videoId, durationSeconds, itemType: item.Type };
      if (itemCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = itemCache.keys().next().value;
        itemCache.delete(firstKey);
      }
      itemCache.set(itemId, result);
      return result;
    } catch (e) {
      console.warn('[EnhancedVideoPreviews] Error resolving item:', e);
      return null;
    }
  };

  const findImageHostContainer = (target) => {
    if (target.classList.contains('listItemImage')) {
      return target;
    }
    const cardImage = target.querySelector('.cardImageContainer, .cardScalable, .cardBox');
    if (cardImage) {
      return cardImage;
    }
    const parentImage = target.closest('.cardImageContainer, .cardScalable, .cardBox, .listItemImage');
    if (parentImage) {
      return parentImage;
    }
    return target;
  };

  const playPreview = async (itemId, targetContainer, sessionId) => {
    if (!config.enabled) return;

    const creds = getCredentials();
    if (!creds || !creds.token) {
      return;
    }

    const baseUrl = getBaseUrl();
    const mediaInfo = await resolvePlayableItem(itemId, creds, baseUrl);
    if (!mediaInfo || sessionId !== activeSessionId) {
      return;
    }

    const hostContainer = findImageHostContainer(targetContainer);
    if (!hostContainer || !document.body.contains(hostContainer)) {
      return;
    }

    // Ensure host container has relative or absolute position for proper clipping
    const hostStyle = window.getComputedStyle(hostContainer);
    if (hostStyle.position === 'static') {
      hostContainer.style.position = 'relative';
    }

    // Calculate start time
    let startTime = config.previewStartTime;
    if (mediaInfo.durationSeconds > 0 && startTime >= mediaInfo.durationSeconds) {
      startTime = Math.max(0, Math.floor(mediaInfo.durationSeconds * 0.15));
    }
    const startTimeTicks = Math.max(0, Math.round(startTime * 10000000));

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'jellyfin-enhanced-preview-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.25s ease-in-out;
    `;

    const video = document.createElement('video');
    video.muted = config.muteAudio;
    video.loop = config.loopPreview;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playbackRate = config.playbackSpeed;
    video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      border-radius: inherit;
    `;

    overlay.appendChild(video);
    hostContainer.appendChild(overlay);

    activeOverlay = overlay;
    activeVideoElement = video;
    activePreviewContainer = hostContainer;

    video.oncanplay = () => {
      if (sessionId === activeSessionId && activeOverlay) {
        activeOverlay.style.opacity = '1';
      }
    };

    const tryTranscodeFallback = async () => {
      if (sessionId !== activeSessionId || !config.fallbackToTranscoding) {
        clearPreview();
        return;
      }
      const transcodeHeight = Math.round((config.transcodeWidth * 9) / 16);
      const transcodeUrl = `${baseUrl}/Videos/${mediaInfo.videoId}/stream.mp4?api_key=${creds.token}&VideoCodec=h264&AudioCodec=aac&Width=${config.transcodeWidth}&Height=${transcodeHeight}&StartTimeTicks=${startTimeTicks}`;
      try {
        video.src = transcodeUrl;
        video.playbackRate = config.playbackSpeed;
        await video.play();
      } catch {
        clearPreview();
      }
    };

    video.onerror = () => {
      if (sessionId === activeSessionId) {
        tryTranscodeFallback();
      }
    };

    // Direct playback attempt
    if (config.preferDirectStream) {
      const directUrl = `${baseUrl}/Videos/${mediaInfo.videoId}/stream?static=true&api_key=${creds.token}&StartTimeTicks=${startTimeTicks}`;
      video.src = directUrl;
      try {
        await video.play();
        if (startTime > 0) {
          video.currentTime = startTime;
        }
      } catch {
        await tryTranscodeFallback();
      }
    } else {
      await tryTranscodeFallback();
    }
  };

  const getItemIdFromElement = (element) => {
    if (!element) return null;
    let id = element.getAttribute('data-id') || element.dataset?.id;
    if (id) return id;

    const btnWithId = element.querySelector('button[data-id], a[data-id], [data-id]');
    if (btnWithId) {
      id = btnWithId.getAttribute('data-id');
      if (id) return id;
    }

    const parentWithId = element.closest('[data-id]');
    if (parentWithId) {
      id = parentWithId.getAttribute('data-id');
      if (id) return id;
    }

    return null;
  };

  const attachHoverListeners = (container) => {
    if (container.dataset.enhancedPreviewAttached) {
      return;
    }

    const itemId = getItemIdFromElement(container);
    if (!itemId) {
      return;
    }

    container.dataset.enhancedPreviewAttached = 'true';

    const handleMouseEnter = (event) => {
      // Ignore touch events
      if (event.pointerType && event.pointerType !== 'mouse') {
        return;
      }

      if (currentHoverTarget !== container) {
        clearPreview();
        currentHoverTarget = container;
        const sessionId = activeSessionId;
        hoverTimeout = setTimeout(() => {
          playPreview(itemId, container, sessionId);
        }, config.hoverDelay);
      }
    };

    const handleMouseLeave = () => {
      if (currentHoverTarget === container) {
        clearPreview();
      }
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
  };

  const scanCards = () => {
    const cardSelectors = [
      '.cardOverlayContainer',
      '.listItemImage.listItemImage-large.itemAction',
      '.cardImageContainer',
      '.cardScalable',
      '.cardBox',
      '.card',
    ];
    document.querySelectorAll(cardSelectors.join(',')).forEach((el) => {
      if (!el.dataset.enhancedPreviewAttached) {
        attachHoverListeners(el);
      }
    });
  };

  const initObservers = () => {
    let scanTimeout = null;
    const debouncedScan = () => {
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scanCards, 150);
    };

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          debouncedScan();
          break;
        }
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Navigation and page change handlers
    const handleNav = () => {
      clearPreview();
      debouncedScan();
    };

    window.addEventListener('popstate', handleNav);
    window.addEventListener('hashchange', handleNav);
    window.addEventListener('beforeunload', clearPreview);
    document.addEventListener('pageshow', handleNav);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPreview();
    });

    if (window.Events && typeof window.Events.on === 'function') {
      try {
        window.Events.on(window.ApiClient, 'authenticated', () => {
          loadServerConfig();
          debouncedScan();
        });
      } catch {
        // Ignore
      }
    }
  };

  // Bootstrap
  const init = async () => {
    await loadServerConfig();
    scanCards();
    initObservers();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
