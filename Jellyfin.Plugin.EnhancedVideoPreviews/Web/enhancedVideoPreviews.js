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

  const ICON_VOLUME_MUTED =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L18.73 21 20 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>' +
    '</svg>';

  const ICON_VOLUME_ON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
    '</svg>';

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
      // Authenticated JSON API calls must use the Authorization header (which
      // ApiClient builds automatically); the server rejects ?api_key= on these
      // endpoints. Query-string api_key remains valid only for media URLs
      // (<video>/<img> src) later in this file, which can't carry headers.
      const hasApiClient = window.ApiClient && typeof window.ApiClient.getItem === 'function';

      const fetchJson = async (path, params) => {
        if (!hasApiClient) {
          const query = new URLSearchParams({ ...params, api_key: creds.token });
          const resp = await fetch(`${baseUrl}${path}?${query.toString()}`);
          return resp.ok ? resp.json() : null;
        }
        return null;
      };

      const item = hasApiClient
        ? await window.ApiClient.getItem(creds.userId, itemId)
        : await fetchJson(creds.userId ? `/Users/${creds.userId}/Items/${itemId}` : `/Items/${itemId}`, {});

      if (!item) {
        return null;
      }

      let videoId = itemId;
      let durationSeconds = item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000000) : 0;

      // Handle Series, Season, or Collection by querying the first playable episode/video
      if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'BoxSet') {
        const queryOptions = {
          parentId: itemId,
          recursive: true,
          includeItemTypes: item.Type === 'BoxSet' ? 'Movie,Episode,Video' : 'Episode',
          sortBy: 'IndexNumber,SortName',
          sortOrder: 'Ascending',
          limit: 1,
        };

        const list = hasApiClient
          ? await window.ApiClient.getItems(creds.userId, queryOptions)
          : await fetchJson(creds.userId ? `/Users/${creds.userId}/Items` : '/Items', queryOptions);

        if (list && list.Items && list.Items.length > 0) {
          const first = list.Items[0];
          videoId = first.Id;
          durationSeconds = first.RunTimeTicks ? Math.floor(first.RunTimeTicks / 10000000) : 0;
        } else {
          return null;
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
    // Always start muted: this plays after a setTimeout (the hover delay), which
    // breaks the browser's "user gesture" chain, so unmuted autoplay would be
    // blocked outright. Unmuting an already-playing element isn't restricted,
    // so we flip it on once playback actually starts (see oncanplay below).
    video.muted = true;
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

    // When audio isn't forced off, give the user a manual mute toggle, since
    // sound auto-starts as soon as playback begins (see oncanplay below).
    let muteToggleButton = null;
    if (!config.muteAudio) {
      muteToggleButton = document.createElement('div');
      muteToggleButton.className = 'jellyfin-enhanced-preview-mute-toggle';
      muteToggleButton.style.cssText = `
        position: absolute;
        bottom: 8px;
        left: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        z-index: 21;
        font-size: 14px;
        line-height: 1;
        color: #fff;
        user-select: none;
      `;
      muteToggleButton.innerHTML = ICON_VOLUME_MUTED;
      muteToggleButton.title = 'Mute/unmute preview';
      muteToggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        video.muted = !video.muted;
        muteToggleButton.innerHTML = video.muted ? ICON_VOLUME_MUTED : ICON_VOLUME_ON;
      });
      overlay.appendChild(muteToggleButton);
    }

    hostContainer.appendChild(overlay);

    activeOverlay = overlay;
    activeVideoElement = video;
    activePreviewContainer = hostContainer;

    video.oncanplay = () => {
      if (sessionId === activeSessionId && activeOverlay) {
        activeOverlay.style.opacity = '1';
        if (!config.muteAudio) {
          video.muted = false;
          if (muteToggleButton) {
            muteToggleButton.innerHTML = ICON_VOLUME_ON;
          }
        }
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
