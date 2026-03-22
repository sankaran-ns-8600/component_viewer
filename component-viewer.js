/* ComponentViewer: overlay + toolbar; renderers: image, video (jPlayer), audio (jPlayer), pdf (pdf.js), markdown.
 * Priority: onRender -> built-in -> unsupported. Toolbar: onRender { toolbar } or built-in + toolbarItems + download/zoom.
 * onToolbar can modify. Per-container. (c) 2026 | MIT */
/* No I18N */
(function ($, window, document) {
  'use strict'; // No I18N

  var HTTP_PREFIX = ['http', '://'].join('');
  var HTTPS_PREFIX = ['https', '://'].join('');
  var JS_PROTO = ['javascript', ':'].join('');
  var VBS_PROTO = ['vbscript', ':'].join('');

  function isNullish (x) {
    return x === null || x === undefined;
  }

  var PLUGIN_NAME = 'componentViewer'; // No I18N
  var jpCounter = 0;
  var SLIDESHOW_DEFAULT_INTERVAL = 4;

  /* --- DEFAULT OPTIONS --- */

  /* No I18N */
  var DEFAULTS = {
    /** When set to a non-empty array of item objects, used as the items list instead of collecting from DOM (selector). Each item: { type, title, src, ... }. */
    items: null,
    selector: '.cv-item',
    loop: true,
    overlayClose: true,
    keyboardNav: true,
    showCounter: true, // when false, hide the "1 / 6" counter in the header
    preloadAdjacentImages: true, // when true, preload next/prev item if image so navigation is instant (Colorbox-style)
    /** When true, hide header/footer; only stage and prev/next. Close via Escape/backdrop. Object: { enabled, hideNavigation }. */
    stageOnly: { enabled: false, hideNavigation: false },
    /** Carousel: thumbnails below stage. { enabled, navThreshold } (default 4). */
    carousel: { enabled: false, navThreshold: 4 },
    /** Slideshow: auto-advance. { enabled, interval, autoStart, advanceMedia: 'interval'|'onEnd', showProgress, hideSlideshowButton }. */
    slideshow: null,
    theme: 'dark',
    themeToggle: true,
    onThemeChange: null,
    /** When true, show a header button to toggle overlay fullscreen (native Fullscreen API). Does not affect video/audio fullscreen. Default true. */
    fullscreen: true,

    /** When true, horizontal touch swipe on the stage (e.g. on mobile) goes to prev/next item. Does not affect keyboard or button nav; desktop uses prev/next buttons or arrows. Default true. */
    swipeNav: true,

    /** When true, downward touch swipe on the stage (e.g. on mobile) closes the overlay. Only applies when overlayClose is true. Desktop unchanged. Default true. */
    swipeToClose: true,

    /** When true, show custom tooltips on hover for header/footer/toolbar buttons. When false, no tooltips. Tooltip text comes from defaultStrings (I18N) or, for custom toolbar items, from label (if given). Default true. */
    canShowTooltip: true,

    toolbar: {
      download: true,
      zoom: true,
      extractText: false
    },

    zoom: {
      min: 1,
      max: 5,
      step: 0.01,
      wheelStep: 0.15,
      showPercentage: false,
      onZoom: null,
      loadHighResUrlAt: false // number (e.g. 1.25) or false; when zoom exceeds this, reload image from item.zoomUrl (itemData) or item.downloadUrl
    },

    pdf: {
      workerSrc: null,
      cMapUrl: null, // e.g. CDN URL for pdfjs cmaps (No I18N)
      cMapPacked: true,
      annotations: true, // render PDF annotations (links, highlights); compatible with PDF.js 2.2.x and 3.x (uses Util.normalizeRect when available, else internal fallback)
      autoFit: true, // if true, scale page to fit stage (width and height); if false, fit to width only
      autoFitMinScale: 0.75, // when autoFit is true, scale never goes below this so the PDF stays readable (default 0.75 = 75%)
      autoFitMaxScale: 2.5, // max scale when autoFit is true (cap zoom)
      twoPageView: false, // when true, show two pages side-by-side (spread) like a book
      extractText: false // when true, show the "Extract text" (text layer toggle) button for PDFs
    },

    /** When true, markdown items get a toolbar button to toggle between rendered markdown and raw/source view. Default false. */
    markdown: { toggleRawView: false },

    /**
     * Inline (source code) view: optional syntax highlighting via Highlight.js.
     * - syntaxHighlight: when true, use window.hljs if present (host must include highlight.js script + a theme CSS). Built-in uses v9 API: highlight(lang, code, ignore_illegals).
     * - getLanguage: function(item) returning language string (e.g. 'javascript', 'java'). If null, inferred from item.fileExt / item.title.
     * - onInlineHtml: function(content, item, inst) returning HTML for .cv-inline-body. When set, overrides built-in (e.g. custom highlighter).
     */
    inline: { syntaxHighlight: false, getLanguage: null },
    onInlineHtml: null,

    /**
     * Video (built-in jPlayer path only; not used when jPlayer is missing and the native video fallback runs).
     * See documentation for canShowHDButton and beforeVideoPlay (gateContent matches beforeOpen).
     */
    video: { onGetHdUrl: null, canShowHDButton: null, beforeVideoPlay: null },
    /** Supported media formats (e.g. 'm4v', 'mp3'); per-item override via item.supplied. */
    supportedVideoFormats: null,
    supportedAudioFormats: null,

    toolbarItems: [],

    /** onDownload(item, viewer): called when the user clicks Download. viewer is the ComponentViewer instance. If null, default link download. */
    onDownload: null,
    itemData: null,

    /**
     * resolveUrl(item, viewer, urlType): called before loading a URL. urlType tells which URL is needed:
     *   'src' — main content URL (image, video, audio, pdf, inline, html, markdown). Fallback: item.src.
     *   'zoomUrl' — high-res image when user zooms. Fallback: item.zoomUrl || item.downloadUrl || item.src.
     *   'thumbnailUrl' — poster/thumbnail (e.g. video poster, carousel thumb). Fallback: item.thumbnailUrl.
     * Return the URL string to use; if null/empty, the fallback is used. So the user can resolve the correct URL per use.
     */
    resolveUrl: null,

    /** Full override: onRender renders into $stage; return { toolbar, destroy }. */
    onRender: null,
    /** onToolbar(item, defaultToolbar, viewer): modify toolbar; not called when onRender provides toolbar. */
    onToolbar: null,

    onLoading: null,
    onOpen: null,
    /** Fires right after the current item's content is displayed (after transition if any). Similar to Colorbox onComplete. */
    onComplete: null,
    /** Fires at the start of the close process, before teardown. Similar to Colorbox onCleanup. */
    onCleanup: null,
    onClose: null,

    /** onError({ type, message, item, $stage }): return true to handle and skip default error card. */
    onError: null,

    /**
     * When true, enables WCAG-oriented behavior: focus trap (Tab loops inside overlay),
     * save/restore focus on open/close, initial focus on close button, and aria-hidden toggling.
     */
    wcag: false,

    /**
     * When true, the shortcuts popup can be opened with ? and shows context-aware keyboard shortcuts.
     * Set to false to disable the popup (and the ? key opening it).
     */
    shortcutsPopup: true,

    /**
     * Poll-option UI: when enabled, shows option label + checkbox/radio above the toolbar
     * for items that have pollOptionLabel. Title remains the image name.
     *   enabled: boolean
     *   mode: 'radio' | 'checkbox'
     *   onSelect: function(item, selected, viewer, element) — selected is true/false; element is the DOM node to which the item was bound (the .cv-item element from which itemData was built). To get the parent to which the viewer is bound: viewer.$container (jQuery) or viewer.$container[0] (DOM).
     */
    pollOption: null,

    /**
     * When true, enables attachment comment/description: item.comment (or data-comment) is shown
     * in a panel below the stage, with a header toggle button to show/hide it (LC-Lightbox style).
     * Default false.
     */
    showAttachmentComment: false,

    /**
     * Image extract-text (OCR overlay).
     * canShowExtractText(item, inst): return true to show the "Extract text" toolbar button for the current image.
     * extractText(item, inst, doneCallback, errorCallback): host performs OCR and calls doneCallback(resp) on success
     *   or errorCallback(message) on failure. resp shape: { data: { lines: [ [ { box, word }, ... ], ... ] } }
     *   While waiting, a circle loader is shown; on error the loader is removed and a strip message shows the given message.
     *   Overlay is removed when the user zooms; click "Extract text" again to re-fetch.
     */
    canShowExtractText: null,
    extractText: null,

    /**
     * beforeOpen(item, element, proceed): optional. If set, the overlay opens immediately with a circle loader (footer toolbar hidden) while your logic runs. Call proceed() or proceed({}) to load the item; call proceed({ gateContent: { html, onProceed? } }) to show gate HTML in the stage instead (toolbar stays hidden until the item loads). Same for open() / click / static $.componentViewer(...).componentViewer('open', 0). For items-only usage, element may be an empty jQuery set if item.$el is missing.
     *   proceed(openOptions): gateContent shows gated UI; otherwise openOptions become inst._openContext for resolveUrl etc.
     */
    beforeOpen: null
  };

  /* --- DEFAULT STRINGS (I18N) --- */
  /* No I18N */

  var DEFAULT_STRINGS = {
    close: 'Close',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    attachments: 'Attachments',
    showAttachments: 'Show attachments',
    scrollCarouselLeft: 'Scroll carousel left',
    scrollCarouselRight: 'Scroll carousel right',
    previousItem: 'Previous item',
    nextItem: 'Next item',
    zoomOut: 'Zoom out',
    zoomLevel: 'Zoom level',
    zoomIn: 'Zoom in',
    switchToLightMode: 'Switch to light mode',
    switchToDarkMode: 'Switch to dark mode',
    playSlideshow: 'Play slideshow',
    pauseSlideshow: 'Pause slideshow',
    download: 'Download',
    downloadSource: 'Download source',
    invalidImageUrl: 'Invalid or unsafe image URL',
    imageLoadFailed: 'Image could not be loaded',
    play: 'Play',
    pause: 'Pause',
    playbackSpeed: 'Playback Speed',
    cyclePlaybackSpeed: 'Cycle playback speed',
    hd: 'HD',
    toggleHd: 'Toggle HD',
    mute: 'Mute',
    unmute: 'Unmute',
    thumbnails: 'Thumbnails',
    previousPage: 'Previous Page',
    nextPage: 'Next Page',
    rotate: 'Rotate',
    print: 'Print',
    extractText: 'Extract text',
    twoPageView: 'Two-page view',
    singlePageView: 'Single-page view',
    copy: 'Copy',
    copiedToClipboard: 'Copied to clipboard',
    viewSource: 'View source',
    viewMarkdown: 'View as Markdown',
    pdf: 'PDF',
    previewNotAvailable: 'Preview is not available for this file',
    file: 'File',
    audio: 'Audio',
    couldNotLoadFileInline: 'Could not load file for inline view',
    noContentInline: 'No content or invalid URL for inline view',
    noHtmlProvided: 'No HTML provided for html view',
    typeVideo: 'Video',
    typeCode: 'Code',
    typeHtml: 'HTML',
    typeError: '—',
    carouselItemLabel: 'Item %1 of %2',
    playPause: 'Play / Pause',
    muteUnmute: 'Mute / Unmute',
    showShortcuts: 'Show shortcuts',
    keyboardShortcuts: 'Keyboard shortcuts',
    toggleTheme: 'Toggle theme',
    toggleSlideshow: 'Play / Pause slideshow',
    pollUpdated: 'Updated',
    toggleComment: 'Toggle comment',
    commentBy: 'by',
    commentPrev: 'Previous comment',
    commentNext: 'Next comment',
    commentCounter: 'Comment %1 of %2'
  };

  /**
   * Resolve a string by key from the registry (plugin defaultStrings or DEFAULT_STRINGS). Used for I18N.
   */
  function str (inst, key) {
    var reg = ($ && $.fn && $.fn[PLUGIN_NAME] && $.fn[PLUGIN_NAME].defaultStrings) || DEFAULT_STRINGS;
    var v = reg[key];
    return (!isNullish(v) && v !== '') ? String(v) : key;
  }

  /* --- ICONS --- */
  /* No I18N */

  var Icons = {
    close: '&times;',
    prev: '&#10094;',
    next: '&#10095;',
    zoomIn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    fileIcon: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    error: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    rotateCw: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    prevPage: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
    nextPage: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
    thumbnails: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    extractText: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    twoPageView: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/></svg>',
    themeLight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    themeDark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    fullscreen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    fullscreenExit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>',
    comment: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  };

  /**
   * Escape a string for safe use in HTML (prevents XSS from item.title / fileName / fileSize etc.).
   * Coerces to string so non-primitive values cannot inject script.
   */
  function escHtml (s) {
    var str;
    if (isNullish(s) || s === '') {
      str = '';
    } else if (typeof s === 'string') {
      str = s;
    } else {
      str = String(s);
    }
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /**
   * Safe string for use as download filename (a.download). Strips characters that could
   * cause XSS or path injection if the value were ever reflected in HTML or file paths.
   */
  function safeDownloadFilename (s) {
    var str;
    if (isNullish(s) || s === '') {
      str = 'file';
    } else if (typeof s === 'string') {
      str = s;
    } else {
      str = String(s);
    }
    var controlAndBad = new RegExp('[<>:"/\\\\|?*]', 'g');
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        out += str.charAt(i);
      }
    }
    return out.replace(controlAndBad, '').trim() || 'file';
  }

  /**
   * Returns true if the URL is safe for loading as a resource (img, video, audio, PDF, iframe).
   * Rejects javascript:, vbscript:, and other script/data URLs that could execute code.
   * Allows http(s), blob, protocol-relative (//), relative paths (/, ./, ../, or no scheme), and safe data: URIs.
   */
  function isSafeResourceUrl (url) {
    if (isNullish(url) || typeof url !== 'string') {
      return false;
    }
    var u = url.trim();
    var lower = u.toLowerCase();
    if (lower.indexOf(JS_PROTO) === 0 || lower.indexOf(VBS_PROTO) === 0) {
      return false;
    }
    if (lower.indexOf(HTTP_PREFIX) === 0 || lower.indexOf(HTTPS_PREFIX) === 0 || lower.indexOf('blob:') === 0) {
      return true;
    }
    /* Protocol-relative URL (e.g. "//cdn.example.com/file") — no https:// in URL, resolves to current scheme */
    if (lower.indexOf('//') === 0) {
      return true;
    }
    if (lower.indexOf('data:') === 0) {
      var after = lower.slice(5).split(',')[0];
      var mime = after.split(';')[0].trim();
      if (mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0 || mime.indexOf('audio/') === 0 || mime === 'application/pdf') {
        return true;
      }
      return false;
    }
    /* Relative URLs (same-origin): no scheme or path from root, e.g. "/connect/downloadFile.do", "file.pdf", "./file.md" */
    if (u.indexOf(':') < 0 || u.indexOf('/') === 0 || u.indexOf('./') === 0 || u.indexOf('../') === 0) {
      return true;
    }
    return false;
  }

  /**
   * Returns true if the URL is safe for use as a download link (a.href).
   * Allows http(s), blob, protocol-relative (//), and relative paths (/, ./, ../, or no scheme).
   * Rejects javascript:, vbscript:, data: to prevent script execution.
   */
  function isSafeDownloadUrl (url) {
    if (isNullish(url) || typeof url !== 'string') {
      return false;
    }
    var u = url.trim();
    var lower = u.toLowerCase();
    if (lower.indexOf(JS_PROTO) === 0 || lower.indexOf(VBS_PROTO) === 0 || lower.indexOf('data:') === 0) {
      return false;
    }
    if (lower.indexOf(HTTP_PREFIX) === 0 || lower.indexOf(HTTPS_PREFIX) === 0 || lower.indexOf('blob:') === 0) {
      return true;
    }
    if (lower.indexOf('//') === 0) {
      return true;
    }
    if (u.indexOf(':') < 0 || u.indexOf('/') === 0 || u.indexOf('./') === 0 || u.indexOf('../') === 0) {
      return true;
    }
    return false;
  }

  function getItemDownloadUrl (item) {
    if (!item) {
      return null;
    }
    var url = item.downloadUrl || item.src;
    return (url && isSafeDownloadUrl(url)) ? url : null;
  }

  /**
   * Returns the URL to use for the given urlType. urlType: 'src' | 'zoomUrl' | 'thumbnailUrl'.
   * If opts.resolveUrl(item, viewer, urlType) is set, it is called; if it returns a truthy string, that is used.
   * Otherwise: 'src' -> item.src, 'zoomUrl' -> item.zoomUrl || item.downloadUrl || item.src, 'thumbnailUrl' -> item.thumbnailUrl.
   */
  function getResolvedUrl (item, inst, urlType) {
    if (!item) {
      return null;
    }
    if (inst && typeof inst.opts.resolveUrl === 'function') {
      var resolved = inst.opts.resolveUrl(item, inst, urlType);
      if (resolved != null && resolved !== '') {
        return resolved;
      }
    }
    if (urlType === 'zoomUrl') {
      return (item.zoomUrl && item.zoomUrl !== '') ? item.zoomUrl : (item.downloadUrl || item.src || null);
    }
    if (urlType === 'thumbnailUrl') {
      return item.thumbnailUrl || null;
    }
    return item.src || null;
  }

  /** Convenience: main content URL (getResolvedUrl with 'src'). */
  function getResolvedSrcUrl (item, inst) {
    return getResolvedUrl(item, inst, 'src');
  }

  function performDownload (item, inst) {
    if (inst && typeof inst.opts.onDownload === 'function') {
      inst.opts.onDownload(item, inst); /* second arg: viewer */
      return;
    }
    var url = getItemDownloadUrl(item);
    if (!url) {
      return;
    }
    var a = document.createElement('a');
    a.href = url;
    a.download = safeDownloadFilename(item.title);
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function copyTextToClipboard (text, inst) {
    function showCopied () {
      if (inst && Overlay.$stripMessage && Overlay.$stripMessage.length) {
        Overlay._showStripMessage(str(inst, 'copiedToClipboard'));
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          if (document.execCommand('copy')) {
            showCopied();
          }
        } catch (e) {}
        document.body.removeChild(ta);
      });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) {
        showCopied();
      }
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function getFullscreenElement () {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  }

  var RESERVED_SHORTCUT_KEYS = { escape: 1, arrowleft: 1, arrowright: 1, ' ': 1, m: 1, r: 1, q: 1, d: 1, p: 1, '?': 1, '+': 1, '-': 1, '=': 1, f: 1, t: 1, c: 1, s: 1 };

  /**
   * Sanitize HTML string for use as toolbar icon to prevent XSS (e.g. <svg onload="..."> or <script>).
   * Removes script elements and event-handler attributes.
   */
  function sanitizeIconHtml (html) {
    if (isNullish(html) || typeof html !== 'string') {
      return '';
    }
    var div = document.createElement('div');
    div.innerHTML = html;
    var scripts = div.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }
    var all = div.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = [];
      for (var k = 0; k < el.attributes.length; k++) {
        attrs.push(el.attributes[k].name);
      }
      (function (element, attrList) {
        attrList.forEach(function (name) {
          if (name.toLowerCase().indexOf('on') === 0) {
            element.removeAttribute(name);
          } else if ((name === 'href' || name === 'xlink:href') && element.getAttribute(name)) {
            var val = (element.getAttribute(name) || '').trim().toLowerCase();
            if (val.indexOf(JS_PROTO) === 0 || val.indexOf(VBS_PROTO) === 0) {
              element.setAttribute(name, '#');
            }
          }
        });
      }(el, attrs));
    }
    return div.innerHTML;
  }

  function getMediaSupplied (item, inst) {
    if (item.supplied) {
      return String(item.supplied).split(',')[0].trim();
    }
    var type = item.type || 'video';
    var ext = (item.fileExt || (item.src || '').split('.').pop() || '').toLowerCase();
    var map = {
      mp4: 'm4v', m4v: 'm4v', webm: 'webmv', ogv: 'ogv', flv: 'flv',
      mp3: 'mp3', m4a: 'm4a', ogg: 'oga', oga: 'oga', wav: 'wav', fla: 'fla'
    };
    var fromExt = map[ext] || (type === 'video' ? 'm4v' : 'mp3');
    if (inst) {
      var listStr = type === 'video' ? inst.opts.supportedVideoFormats : inst.opts.supportedAudioFormats;
      if (listStr) {
        var list = listStr.split(',').map(function (s) {
          return s.trim();
        }).filter(Boolean);
        if (list.length) {
          return list.indexOf(fromExt) >= 0 ? fromExt : list[0];
        }
      }
    }
    return fromExt;
  }

  function isImageLikeExtension (item) {
    var ext = (item.fileExt || (item.src || '').split('.').pop() || (item.title || '').split('.').pop() || '').toLowerCase();
    return (/^(png|jpe?g|gif|webp|bmp|ico|svg)$/).test(ext);
  }

  /* --- SHARED OVERLAY --- */

  var Overlay = {
    built: false, visible: false, activeInstance: null,
    _bodyOverflow: null,
    _keydownCaptureBound: false,
    _keydownCaptureHandler: null,
    $el: null, $shell: null, $title: null, $counter: null,
    $stageWrap: null, $stage: null, $loader: null,
    $prev: null, $next: null, $footer: null,
    $pollOption: null, $footerRow: null,
    $toolbar: null, $zoomWidget: null, $zoomSlider: null, $zoomPct: null,

    _zoom: 1, _panX: 0, _panY: 0,
    _isPanning: false, _panOriginX: 0, _panOriginY: 0, _panStartX: 0, _panStartY: 0,
    _pinchStartDist: 0, _pinchStartZoom: 1,
    _pinchMidX: 0, _pinchMidY: 0, _pinchPanStartX: 0, _pinchPanStartY: 0,
    _pinchMidStartX: 0, _pinchMidStartY: 0,
    _justEndedPinch: false,
    _highResLoaded: false, _highResLoading: false, _highResSliderDebounceTimer: null,
    _isImageItem: false, _isPdfItem: false, _isCustomRendered: false,
    _swipeStartX: 0, _swipeStartY: 0, _swipeEndX: 0, _swipeEndY: 0, _swipeTracking: false,

    ensure: function () {
      if (this.built) {
        return;
      }
      var toolbarIconStyle = '<style id="cv-toolbar-icon-style">' +
        '.cv-overlay .cv-toolbar .cv-tb-btn .cv-tb-icon,.cv-overlay .cv-toolbar .cv-tb-btn .cv-tb-icon::before,' +
        '.cv-overlay .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil,.cv-overlay .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil::before' +
        '{color:rgba(255,255,255,.95)!important;opacity:1!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn .cv-tb-icon,.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn .cv-tb-icon::before,' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil,.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn i.cv-tb-icon.ci-pencil::before' +
        '{color:#444!important;opacity:1!important}' +
        '.cv-overlay .cv-toolbar .cv-tb-btn{background:rgba(255,255,255,.08)!important;border:none!important;border-radius:6px!important;padding:6px 10px!important;min-width:32px!important;min-height:32px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}' +
        '.cv-overlay .cv-toolbar .cv-tb-btn:hover{background:rgba(255,255,255,.2)!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn{background:rgba(0,0,0,.06)!important;color:#444!important}' +
        '.cv-overlay.cv-theme-light .cv-toolbar .cv-tb-btn:hover{background:rgba(0,0,0,.12)!important}' +
        '</style>';
      var html =
        '<div class="cv-overlay">' +
          toolbarIconStyle +
          '<div class="cv-backdrop" aria-hidden="true"></div>' +
          '<div class="cv-shell" id="cv-dialog">' +
            '<div class="cv-header">' +
              '<div class="cv-header-left"><span class="cv-counter" id="cv-dialog-desc"></span></div>' +
              '<div class="cv-header-center"><span class="cv-title" id="cv-dialog-title"></span></div>' +
              '<div class="cv-header-right">' +
              '<button class="cv-comment-toggle" type="button" style="display:none">' + Icons.comment + '</button>' +
              '<button class="cv-carousel-toggle" type="button" style="display:none">' + Icons.thumbnails + '</button>' +
              '<button class="cv-fullscreen-toggle" type="button" style="display:none">' + Icons.fullscreen + '</button>' +
              '<button class="cv-theme-toggle" type="button">' + Icons.themeLight + '</button>' +
              '<button class="cv-close" type="button">' + Icons.close + '</button></div>' +
            '</div>' +
            '<div class="cv-body">' +
              '<button class="cv-nav cv-nav-prev" type="button"><span class="cv-nav-icon">' + Icons.prev + '</span></button>' +
              '<div class="cv-stage-wrap">' +
                '<div class="cv-loader"><div class="cv-spinner"></div></div>' +
                '<div class="cv-stage"></div>' +
                '<div class="cv-comment-wrap" aria-hidden="true" role="region" aria-label="Attachment comment">' +
                  '<div class="cv-comment-nav" style="display:none">' +
                    '<button class="cv-comment-prev" type="button" aria-label="Previous comment">' + Icons.prev + '</button>' +
                    '<span class="cv-comment-counter" aria-live="polite"></span>' +
                    '<button class="cv-comment-next" type="button" aria-label="Next comment">' + Icons.next + '</button>' +
              '</div>' +
                  '<div class="cv-comment-title"></div>' +
                  '<div class="cv-comment-author"></div>' +
                  '<div class="cv-comment-sep"></div>' +
                  '<div class="cv-comment-inner"></div>' +
                '</div>' +
              '</div>' +
              '<button class="cv-nav cv-nav-next" type="button"><span class="cv-nav-icon">' + Icons.next + '</span></button>' +
            '</div>' +
            '<div class="cv-carousel-wrap">' +
              '<button class="cv-carousel-nav cv-carousel-prev" type="button">' + Icons.prev + '</button>' +
              '<div class="cv-carousel-inner">' +
                '<div class="cv-carousel"></div>' +
              '</div>' +
              '<button class="cv-carousel-nav cv-carousel-next" type="button">' + Icons.next + '</button>' +
            '</div>' +
            '<div class="cv-footer">' +
              '<div class="cv-slideshow-progress-wrap"><div class="cv-slideshow-progress-bar"></div></div>' +
              '<div class="cv-poll-option"></div>' +
              '<div class="cv-footer-row">' +
              '<div class="cv-toolbar"></div>' +
              '<div class="cv-zoom-widget">' +
                '<button class="cv-tb-btn cv-zoom-out-btn" type="button">' + Icons.zoomOut + '</button>' +
                '<input type="range" class="cv-zoom-slider" min="1" max="5" step="0.01" value="1" />' +
                '<button class="cv-tb-btn cv-zoom-in-btn" type="button">' + Icons.zoomIn + '</button>' +
                '<span class="cv-zoom-pct">100%</span>' +
              '</div>' +
              '</div>' +
            '</div>' +
            '<div class="cv-shortcuts-popup" role="dialog" aria-label="Keyboard shortcuts" aria-hidden="true"></div>' +
            '<div class="cv-strip-message" id="cv-strip-message" aria-live="polite" role="status"></div>' +
          '</div>' +
        '</div>';

      $('body').append(html);
      this.$el = $('.cv-overlay').last();
      var sel = { $backdrop: '.cv-backdrop', $shell: '.cv-shell', $title: '.cv-title', $counter: '.cv-counter', $themeToggle: '.cv-theme-toggle', $fullscreenToggle: '.cv-fullscreen-toggle', $stageWrap: '.cv-stage-wrap', $stage: '.cv-stage', $commentWrap: '.cv-comment-wrap', $commentNav: '.cv-comment-nav', $commentPrev: '.cv-comment-prev', $commentNext: '.cv-comment-next', $commentCounter: '.cv-comment-counter', $commentTitle: '.cv-comment-title', $commentAuthor: '.cv-comment-author', $commentSep: '.cv-comment-sep', $commentInner: '.cv-comment-inner', $commentToggle: '.cv-comment-toggle', $loader: '.cv-loader', $prev: '.cv-nav-prev', $next: '.cv-nav-next', $carouselWrap: '.cv-carousel-wrap', $carousel: '.cv-carousel', $carouselToggle: '.cv-carousel-toggle', $carouselPrev: '.cv-carousel-prev', $carouselNext: '.cv-carousel-next', $footer: '.cv-footer', $pollOption: '.cv-poll-option', $footerRow: '.cv-footer-row', $toolbar: '.cv-toolbar', $stripMessage: '.cv-strip-message', $zoomWidget: '.cv-zoom-widget', $zoomSlider: '.cv-zoom-slider', $zoomPct: '.cv-zoom-pct', $slideshowProgressWrap: '.cv-slideshow-progress-wrap', $slideshowProgressBar: '.cv-slideshow-progress-bar', $shortcutsPopup: '.cv-shortcuts-popup' };
      for (var p in sel) {
        this[p] = sel[p].charAt(0) === '#' ? $(sel[p]) : this.$el.find(sel[p]);
      }
      this.$tooltip = $();
      this.$zoomPct.hide();
      this._bindEvents();
      this._bindTooltip();
      this.built = true;
    },

    _bindKeydownCaptureOnce: function () {
      if (this._keydownCaptureBound) {
        return;
      }
      this._keydownCaptureBound = true;
      var self = this;
      var handler = function (e) {
        if (self._handleKeydown(e)) {
        e.preventDefault();
        e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };
      this._keydownCaptureHandler = handler;
      document.addEventListener('keydown', handler, true);
    },

    _handleKeydown: function (e) {
      if (!this.visible || !this.activeInstance) {
        return false;
      }
      if (!this.activeInstance.opts.keyboardNav) {
        return false;
      }
      var self = this;
      var $popup = self.$shortcutsPopup;
      var popupOpen = $popup && $popup.length && $popup.hasClass('cv-open');
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        if (self.activeInstance.opts.shortcutsPopup !== false) {
          if (popupOpen) {
            self._hideShortcutsPopup();
          } else {
            self._showShortcutsPopup();
          }
        }
        return true;
      }
      if (e.key === 'Escape') {
        if (popupOpen) {
          self._hideShortcutsPopup();
          return true;
        }
        var fsEl = getFullscreenElement();
        if (fsEl) {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
          setTimeout(function () {
            self._syncFullscreenToggle();
          }, 0);
          return true;
        }
        self.close();
        return true;
      }
      if (e.key === 'ArrowLeft') {
        self._nav('prev');
        return true;
      }
      if (e.key === 'ArrowRight') {
        self._nav('next');
        return true;
      }
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (!(/(input|textarea|select)/).test(tag) && (e.key === '+' || e.key === '=' || e.key === '-')) {
        if (self._isImageItem) {
          var zo = self._zoomOpts();
          var step = (!isNullish(zo.wheelStep) ? zo.wheelStep : 0.25);
          if (e.key === '-') {
            self._setZoom(Math.max(zo.min, self._zoom - step));
          } else {
            self._setZoom(Math.min(zo.max, self._zoom + step));
          }
          return true;
        }
        if (self._isPdfItem) {
          var $pdfZoomOut = self.$toolbar.find('.cv-tb-pdf-zoom-out:visible');
          var $pdfZoomIn = self.$toolbar.find('.cv-tb-pdf-zoom-in:visible');
          if (e.key === '-' && $pdfZoomOut.length) {
            $pdfZoomOut.first().trigger('click');
          } else if ((e.key === '+' || e.key === '=') && $pdfZoomIn.length) {
            $pdfZoomIn.first().trigger('click');
          }
          return true;
        }
      }
        if (e.key === 'Tab' && self.activeInstance.opts.wcag) {
        var isPopupOpen = self.$shortcutsPopup.hasClass('cv-open');
        var container = isPopupOpen ? self.$shortcutsPopup[0] : self.$shell[0];
        if (container) {
          var focusable = container.querySelectorAll('button, [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
          var list = [].slice.call(focusable).filter(function (el) {
            var style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && (el.offsetParent !== null || el.getBoundingClientRect().width > 0);
          });
          if (list.length > 0) {
            var inside = container.contains(e.target);
          var idx = list.indexOf(e.target);
          if (!inside || idx === -1) {
            e.preventDefault();
            list[0].focus();
              return true;
          }
          if (e.shiftKey) {
              if (idx === 0) {
                e.preventDefault();
                list[list.length - 1].focus();
                return true;
              }
            } else if (idx === list.length - 1) {
              e.preventDefault();
              list[0].focus();
              return true;
            }
            return true;
          }
        }
      }
      var evTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if ((/(input|textarea|select)/).test(evTag)) {
        return false;
      }
      var hasBuiltInMedia = !self._isCustomRendered && self.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
      if (e.key === ' ' && hasBuiltInMedia) {
        var $pause = self.$stage.find('.jp-pause:visible');
        if ($pause.length) {
          $pause.first().trigger('click');
          self._showMediaStateFeedback('pause');
          return true;
        }
        var $play = self.$stage.find('.jp-play:visible, .cv-jp-big-play:visible');
        if ($play.length) {
          $play.first().trigger('click');
          self._showMediaStateFeedback('play');
          return true;
        }
        var nativeEl = self.$stage.find('.cv-native-video')[0];
        if (nativeEl) {
          if (nativeEl.paused) {
            nativeEl.play();
            self._showMediaStateFeedback('play');
          } else {
            nativeEl.pause();
            self._showMediaStateFeedback('pause');
          }
          return true;
        }
      }
      if (e.key === 'm' && hasBuiltInMedia) {
        var $unmute = self.$stage.find('.jp-unmute:visible');
        if ($unmute.length) {
          $unmute.first().trigger('click');
          self._showMediaStateFeedback('unmute');
          return true;
        }
        var $mute = self.$stage.find('.jp-mute:visible');
        if ($mute.length) {
          $mute.first().trigger('click');
          self._showMediaStateFeedback('mute');
          return true;
        }
        var nativeMedia = self.$stage.find('.cv-native-video')[0];
        if (nativeMedia) {
          nativeMedia.muted = !nativeMedia.muted;
          self._showMediaStateFeedback(nativeMedia.muted ? 'mute' : 'unmute');
          return true;
        }
      }
      if (e.key === 'r' && hasBuiltInMedia) {
        var PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
        var $speed = self.$stage.find('.cv-jp-speed');
        if ($speed.length) {
          var current = parseFloat($speed.val()) || 1;
          var rateIdx = PLAYBACK_RATES.indexOf(current);
          if (rateIdx < 0) {
            rateIdx = PLAYBACK_RATES.indexOf(1);
          }
          if (rateIdx < 0) {
            rateIdx = 2;
          }
          var nextIdx = (rateIdx + 1) % PLAYBACK_RATES.length;
          var next = PLAYBACK_RATES[nextIdx];
          $speed.val(String(next)).trigger('change');
          return true;
        }
        var nativeMediaEl = self.$stage.find('.cv-native-video')[0] || self.$stage.find('.cv-audio-wrap audio')[0];
        if (nativeMediaEl) {
          var r = nativeMediaEl.playbackRate || 1;
          var i = PLAYBACK_RATES.indexOf(r);
          if (i < 0) {
            i = 0;
            while (i < PLAYBACK_RATES.length && PLAYBACK_RATES[i] < r) {
              i += 1;
            }
            i = Math.min(i, PLAYBACK_RATES.length - 1);
          }
          var ni = (i + 1) % PLAYBACK_RATES.length;
          nativeMediaEl.playbackRate = PLAYBACK_RATES[ni];
          return true;
        }
      }
      var keyShortcuts = { q: function () {
        return self.$stage.find('.cv-jp-hd:visible');
      }, d: function () {
        return self.$toolbar.find('.cv-tb-download:visible');
      }, p: function () {
        return self.$toolbar.find('.cv-tb-pdf-print:visible');
      }, f: function () {
        return self.$fullscreenToggle.filter(':visible');
      }, t: function () {
        return self.$themeToggle.filter(':visible');
      }, c: function () {
        return self.$carouselToggle.filter(':visible');
      }, s: function () {
        return self.$toolbar.find('.cv-slideshow-btn:visible');
      } };
      if (keyShortcuts[e.key]) {
        var $btn = keyShortcuts[e.key]();
        if ($btn.length) {
          $btn.first().trigger('click');
          return true;
        }
      }
      var customKey = (e.key || '').toLowerCase();
      if (!RESERVED_SHORTCUT_KEYS[customKey]) {
        var selKey = customKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var $customBtn = self.$toolbar.find('.cv-tb-btn[data-cv-shortcut="' + selKey + '"]:visible');
        if ($customBtn.length) {
          $customBtn.first().trigger('click');
          return true;
        }
      }
      return false;
    },

    _bindEvents: function () {
      var self = this;
      this.$el.find('.cv-close').on('click', function () {
        self.close();
      });
      this.$themeToggle.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!self.activeInstance) {
          return;
        }
        var inst = self.activeInstance;
        var current = inst.opts.theme || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        inst.opts.theme = next;
        self.$el[0].className = 'cv-overlay cv-visible cv-theme-' + next;
        self._syncThemeToggle();
        if (typeof inst.opts.onThemeChange === 'function') {
          inst.opts.onThemeChange(next, inst);
        }
        return false;
      });
      this.$carouselToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        self._carouselOpen = !self._carouselOpen;
        if (self._carouselOpen) {
          self.$carouselWrap.addClass('cv-open');
        } else {
          self.$carouselWrap.removeClass('cv-open');
        }
        self.$carouselToggle.attr('aria-expanded', self._carouselOpen).toggleClass('cv-active', self._carouselOpen);
        self._updateCarouselNavVisibility(self.activeInstance);
      });
      this.$fullscreenToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        self._toggleOverlayFullscreen();
      });
      this.$commentToggle.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance) {
          return;
        }
        if (self._commentPanelVisible === undefined) {
          self._commentPanelVisible = true;
        }
        self._commentPanelVisible = !self._commentPanelVisible;
        self.$commentWrap.toggle(self._commentPanelVisible).attr('aria-hidden', !self._commentPanelVisible);
        self.$commentToggle.attr('aria-expanded', self._commentPanelVisible).toggleClass('cv-active', self._commentPanelVisible);
        if (self.activeInstance.opts.canShowTooltip !== false) {
          self.$commentToggle.attr('data-cv-tooltip', str(self.activeInstance, 'toggleComment'));
        }
      });
      this.$commentPrev.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance || !self._commentList || self._commentList.length <= 1) {
          return;
        }
        self._commentIndex = self._commentIndex <= 0 ? self._commentList.length - 1 : self._commentIndex - 1;
        self._renderCommentAt(self.activeInstance, self._commentList, self._commentIndex);
      });
      this.$commentNext.on('click', function (e) {
        e.preventDefault();
        if (!self.activeInstance || !self._commentList || self._commentList.length <= 1) {
          return;
        }
        self._commentIndex = self._commentIndex >= self._commentList.length - 1 ? 0 : self._commentIndex + 1;
        self._renderCommentAt(self.activeInstance, self._commentList, self._commentIndex);
      });
      this.$carouselPrev.on('click', function (e) {
        e.preventDefault();
        var el = self.$carousel[0];
        if (el) {
          el.scrollLeft -= (104 + 10) * 5;
        }
      });
      this.$carouselNext.on('click', function (e) {
        e.preventDefault();
        var el = self.$carousel[0];
        if (el) {
          el.scrollLeft += (104 + 10) * 5;
        }
      });
      this.$prev.on('click', function () {
        self._nav('prev');
      });
      this.$next.on('click', function () {
        self._nav('next');
      });
      /* Backdrop close: only when the backdrop element itself is the click target (no delegation). */
      this.$backdrop[0].addEventListener('click', function backdropClick (e) {
        if (e.target !== self.$backdrop[0]) {
          return;
        }
        if (!self.activeInstance || !self.activeInstance.opts.overlayClose) {
          return;
        }
        self.close();
      });
      $(document).off('.cv-overlay-fullscreen').on('fullscreenchange.cv-overlay-fullscreen webkitfullscreenchange.cv-overlay-fullscreen mozfullscreenchange.cv-overlay-fullscreen msfullscreenchange.cv-overlay-fullscreen', function () {
        setTimeout(function () {
          if (self.$fullscreenToggle.length && self.$fullscreenToggle.is(':visible')) {
            self._syncFullscreenToggle();
          }
        }, 0);
      });

      /* zoom slider */
      this.$zoomSlider.on('input', function () {
        if (!self._isImageItem) {
          return;
        }
        var nz = parseFloat(this.value);
        if (self._zoom !== 0) {
          var r = nz / self._zoom; self._panX *= r; self._panY *= r;
        }
        self._zoom = nz;
        removeExtractOverlay(self.$stage);
        self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
        self._clampPan(); self._applyTransform(); self._fireZoom();
        /* debounce high-res load so dragging the slider only triggers one check/load after user pauses */
        if (self._highResSliderDebounceTimer != null) {
          clearTimeout(self._highResSliderDebounceTimer);
        }
        self._highResSliderDebounceTimer = setTimeout(function () {
          self._highResSliderDebounceTimer = null;
          self._loadHighResImageIfNeeded();
        }, 350);
      });
      this.$el.find('.cv-zoom-out-btn').on('click', function () {
        if (!self._isImageItem) {
          return;
        }
        self._setZoom(Math.max(self._zoomOpts().min, self._zoom - 0.25));
      });
      this.$el.find('.cv-zoom-in-btn').on('click', function () {
        if (!self._isImageItem) {
          return;
        }
        self._setZoom(Math.min(self._zoomOpts().max, self._zoom + 0.25));
      });
      this.$zoomPct.on('click', function () {
        if (self._isImageItem) {
          self._setZoom(1);
        }
      });

      /* double-click on stage to reset zoom to 100% */
      this.$stageWrap.on('dblclick', function (e) {
        if (!self._isImageItem) {
          return;
        }
        e.preventDefault();
        self._setZoom(1);
      });

      /* wheel zoom */
      this.$stageWrap[0].addEventListener('wheel', function (e) {
        if (!self.visible || !self._isImageItem) {
          return;
        }
        e.preventDefault();
        var zo = self._zoomOpts();
        var delta = e.deltaY < 0 ? zo.wheelStep : -zo.wheelStep;
        var nz = Math.max(zo.min, Math.min(zo.max, self._zoom + delta));
        if (nz === self._zoom) {
          return;
        }
        if (self._isGifItem()) {
          self._panX = 0; self._panY = 0;
        } else {
        var rect = self.$stageWrap[0].getBoundingClientRect();
        var cx = e.clientX - rect.left - rect.width / 2;
          var cy = e.clientY - rect.top - rect.height / 2;
        var ratio = nz / self._zoom;
        self._panX = cx - ratio * (cx - self._panX);
        self._panY = cy - ratio * (cy - self._panY);
        }
        self._zoom = nz;
        removeExtractOverlay(self.$stage);
        self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
        self._clampPan(); self._syncSlider(); self._applyTransform();
        self._loadHighResImageIfNeeded();
      }, { passive: false });

      /* mouse drag pan (disabled for GIF – kept fixed at center) */
      this.$stageWrap.on('mousedown', function (e) {
        if (!self._isImageItem || self._zoom <= 1 || e.button !== 0) {
          return;
        }
        if (self._isGifItem()) {
          return;
        }
        e.preventDefault();
        self._isPanning = true;
        self._panOriginX = e.clientX; self._panOriginY = e.clientY;
        self._panStartX = self._panX; self._panStartY = self._panY;
      });
      $(document).off('.cv-pan').on('mousemove.cv-pan', function (e) {
        if (!self._isPanning) {
          return;
        }
        self._panX = self._panStartX + (e.clientX - self._panOriginX);
        self._panY = self._panStartY + (e.clientY - self._panOriginY);
        self._clampPan(); self._applyTransform();
      });
      $(document).on('mouseup.cv-pan', function () {
        self._isPanning = false;
      });

      /* touch pinch + pan */
      this.$stageWrap.on('touchstart', function (e) {
        if (!self._isImageItem) {
          return;
        }
        var t = e.originalEvent.touches;
        if (t.length === 2) {
          e.preventDefault();
          self._isPanning = false;
          self._pinchStartDist = self._touchDist(t); self._pinchStartZoom = self._zoom;
          self._pinchPanStartX = self._panX; self._pinchPanStartY = self._panY;
          var rect = self.$stageWrap[0].getBoundingClientRect();
          var midX = (t[0].clientX + t[1].clientX) / 2;
          var midY = (t[0].clientY + t[1].clientY) / 2;
          self._pinchMidStartX = midX - rect.left - rect.width / 2;
          self._pinchMidStartY = midY - rect.top - rect.height / 2;
        } else if (t.length === 1 && self._zoom > 1 && !self._isGifItem()) {
          self._isPanning = true;
          self._panOriginX = t[0].clientX; self._panOriginY = t[0].clientY;
          self._panStartX = self._panX; self._panStartY = self._panY;
        }
      });
      this.$stageWrap.on('touchmove', function (e) {
        if (!self._isImageItem) {
          return;
        }
        var t = e.originalEvent.touches;
        if (t.length === 2 && self._pinchStartDist) {
          e.preventDefault();
          self._justEndedPinch = false;
          var zo = self._zoomOpts();
          var dist = self._touchDist(t);
          var nz = Math.max(zo.min, Math.min(zo.max, self._pinchStartZoom * (dist / self._pinchStartDist)));
          if (self._isGifItem()) {
            self._panX = 0; self._panY = 0;
          } else {
            var midX = (t[0].clientX + t[1].clientX) / 2;
            var midY = (t[0].clientY + t[1].clientY) / 2;
            var rect = self.$stageWrap[0].getBoundingClientRect();
            var cx = midX - rect.left - rect.width / 2;
            var cy = midY - rect.top - rect.height / 2;
            var ratio = nz / self._zoom;
            self._panX = self._pinchMidStartX - ratio * (self._pinchMidStartX - self._pinchPanStartX) + (cx - self._pinchMidStartX);
            self._panY = self._pinchMidStartY - ratio * (self._pinchMidStartY - self._pinchPanStartY) + (cy - self._pinchMidStartY);
          }
          self._zoom = nz;
          removeExtractOverlay(self.$stage);
          self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
          self._clampPan(); self._syncSlider(); self._applyTransform();
          self._loadHighResImageIfNeeded();
        } else if (t.length === 1 && self._isPanning) {
          if (self._justEndedPinch) {
            self._panOriginX = t[0].clientX;
            self._panOriginY = t[0].clientY;
            self._panStartX = self._panX;
            self._panStartY = self._panY;
            self._justEndedPinch = false;
          }
          self._panX = self._panStartX + (t[0].clientX - self._panOriginX);
          self._panY = self._panStartY + (t[0].clientY - self._panOriginY);
          self._clampPan(); self._applyTransform();
        }
      });
      this.$stageWrap.on('touchend touchcancel', function (e) {
        var rem = e.originalEvent.touches;
        if (rem.length === 1 && self._isImageItem && self._zoom > 1 && !self._isGifItem()) {
          self._isPanning = true;
          self._justEndedPinch = self._pinchStartDist > 0;
          self._panOriginX = rem[0].clientX;
          self._panOriginY = rem[0].clientY;
          self._panStartX = self._panX;
          self._panStartY = self._panY;
        } else if (rem.length === 0) {
          self._isPanning = false;
          self._justEndedPinch = false;
        }
        self._pinchStartDist = 0;

        /* swipe nav / swipe to close: on touchend when all fingers up */
        if (self._swipeTracking && rem.length === 0) {
          var dx = self._swipeEndX - self._swipeStartX,
            dy = self._swipeEndY - self._swipeStartY;
          var inst = self.activeInstance;
          if (inst && inst.opts.overlayClose && inst.opts.swipeToClose !== false && dy >= 60 && dy > Math.abs(dx)) {
            e.preventDefault();
            self.close();
          } else if (inst && inst.items.length > 1 && inst.opts.swipeNav !== false && !(self._isImageItem && self._zoom > 1) && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
            self._nav(dx > 0 ? 'prev' : 'next', true);
          }
          self._swipeTracking = false;
        }
      });

      /* touch swipe: start tracking when 1 finger and (swipe nav possible or swipe-to-close enabled) and not in image pan/pinch mode */
      this.$stageWrap.on('touchstart', function (e) {
        var t = e.originalEvent.touches;
        if (t.length !== 1 || !self.activeInstance) {
          return;
        }
        var inst = self.activeInstance;
        var canSwipeNav = inst.items.length > 1 && inst.opts.swipeNav !== false && !(self._isImageItem && self._zoom > 1);
        var canSwipeClose = inst.opts.overlayClose && inst.opts.swipeToClose !== false;
        if (!canSwipeNav && !canSwipeClose) {
          return;
        }
        self._swipeStartX = t[0].clientX;
        self._swipeStartY = t[0].clientY;
        self._swipeEndX = self._swipeStartX;
        self._swipeEndY = self._swipeStartY;
        self._swipeTracking = true;
      });
      this.$stageWrap.on('touchmove', function (e) {
        if (!self._swipeTracking || e.originalEvent.touches.length !== 1) {
          return;
        }
        self._swipeEndX = e.originalEvent.touches[0].clientX;
        self._swipeEndY = e.originalEvent.touches[0].clientY;
      });
    },

    _normalizeComments: function (item) {
      if (!item.comments || !Array.isArray(item.comments) || item.comments.length === 0) {
        return [];
      }
      return item.comments.map(function (c) {
        var t = (c && (c.text !== null && c.text !== undefined)) ? String(c.text).trim() : '';
        var ti = (c && (c.title !== null && c.title !== undefined)) ? String(c.title).trim() : '';
        var a = (c && (c.author !== null && c.author !== undefined)) ? String(c.author).trim() : '';
        return { title: ti, author: a, text: t };
      }).filter(function (c) {
        return c.title !== '' || c.author !== '' || c.text !== '';
      });
    },

    _renderCommentAt: function (inst, list, index) {
      if (!list || !list.length || index < 0 || index >= list.length) {
        return;
      }
      var c = list[index];
      var titleText = (!isNullish(c.title)) ? String(c.title).trim() : '';
      var authorText = (!isNullish(c.author)) ? String(c.author).trim() : '';
      var text = (!isNullish(c.text)) ? String(c.text).trim() : '';
      this.$commentTitle.text(titleText).toggle(titleText !== '');
      this.$commentAuthor.text(authorText ? (str(inst, 'commentBy') + ' ' + authorText) : '').toggle(authorText !== '');
      this.$commentSep.toggle(titleText !== '' || authorText !== '');
      this.$commentInner.text(text).toggle(text !== '');
      this.$commentCounter.text(str(inst, 'commentCounter').replace('%1', String(index + 1)).replace('%2', String(list.length)));
      if (inst.opts.wcag) {
        this.$commentPrev.attr('aria-label', str(inst, 'commentPrev'));
        this.$commentNext.attr('aria-label', str(inst, 'commentNext'));
      }
    },

    _bindTooltip: function () {
      var self = this;
      var hideTimer;
      function showTip ($target) {
        var text = $target.attr('data-cv-tooltip');
        if (!text) {
          return;
        }
        clearTimeout(hideTimer);
        if (!self.$tooltip || !self.$tooltip.length) {
          var $tip = $('<div class="cv-tooltip" id="cv-tooltip" aria-hidden="true"></div>');
          var parent = getFullscreenElement() === self.$el[0] ? self.$el : $('body');
          parent.append($tip);
          $tip.on('mouseenter.cv-tooltip', function () {
            clearTimeout(hideTimer);
          });
          $tip.on('mouseleave.cv-tooltip', hideTip);
          self.$tooltip = $tip;
        }
        self.$tooltip.text(text).attr('aria-hidden', 'false').addClass('cv-tooltip-visible');
        var rect = $target[0].getBoundingClientRect();
        var tipRect = self.$tooltip[0].getBoundingClientRect();
        var left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        var top = rect.top - tipRect.height - 6;
        if (top < 8) {
          top = rect.bottom + 6;
        }
        self.$tooltip.css({ left: left + 'px', top: top + 'px' });
      }
      function hideTip () {
        hideTimer = setTimeout(function () {
          if (self.$tooltip && self.$tooltip.length) {
            self.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
            self.$tooltip = $();
          }
        }, 50);
      }
      this.$el.on('mouseenter.cv-tooltip', '[data-cv-tooltip]', function (e) {
        showTip($(e.currentTarget));
      });
      this.$el.on('mouseleave.cv-tooltip', '[data-cv-tooltip]', function (e) {
        hideTip();
      });
    },

    _applyTooltips: function (inst) {
      if (!inst || !this.$el.length) {
        return;
      }
      var show = inst.opts.canShowTooltip !== false;
      var set = function ($el, key) {
        if (show) {
          $el.attr('data-cv-tooltip', str(inst, key));
        } else {
          $el.removeAttr('data-cv-tooltip');
        }
      };
      var fsEl = getFullscreenElement();
      var tips = [[this.$el.find('.cv-close'), 'close'], [this.$carouselToggle, 'attachments'], [this.$fullscreenToggle, fsEl === this.$el[0] ? 'exitFullscreen' : 'fullscreen'], [this.$themeToggle, (inst.opts.theme || 'dark') === 'dark' ? 'switchToLightMode' : 'switchToDarkMode'], [this.$prev, 'previousItem'], [this.$next, 'nextItem'], [this.$carouselPrev, 'scrollCarouselLeft'], [this.$carouselNext, 'scrollCarouselRight'], [this.$el.find('.cv-zoom-out-btn'), 'zoomOut'], [this.$zoomSlider, 'zoomLevel'], [this.$el.find('.cv-zoom-in-btn'), 'zoomIn']];
      for (var i = 0; i < tips.length; i++) {
        set(tips[i][0], tips[i][1]);
      }
    },

    _nav: function (dir, useTransition) {
      if (!this.activeInstance) {
        return;
      }
      var opts = useTransition ? { transition: true } : undefined;
      if (dir === 'prev') {
        this.activeInstance.prev(opts);
      } else {
        this.activeInstance.next(opts);
      }
    },

    /* zoom helpers */
    _zoomOpts: function () {
      return (this.activeInstance && this.activeInstance.opts.zoom) || DEFAULTS.zoom;
    },
    _isGifItem: function () {
      var inst = this.activeInstance;
      if (!inst || !inst.items || inst.idx < 0) {
        return false;
      }
      var item = inst.items[inst.idx];
      return (item.type || 'image') === 'image' && item.src && (/\.gif$/i).test(item.src);
    },
    _setZoom: function (val) {
      var zo = this._zoomOpts();
      var nz = Math.max(zo.min, Math.min(zo.max, val));
      if (nz !== this._zoom) {
        var r = nz / this._zoom; this._panX *= r; this._panY *= r;
        removeExtractOverlay(this.$stage);
        this.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
      }
      this._zoom = nz; this._clampPan(); this._syncSlider(); this._applyTransform();
      this._loadHighResImageIfNeeded();
    },
    _syncSlider: function () {
      var z = Number(this._zoom);
      this.$zoomSlider.val(z);
      var pct = Math.round(z * 100);
      this.$zoomPct.text(pct + '%');
      this._fireZoom();
    },
    _fireZoom: function () {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var cb = inst.opts.zoom && inst.opts.zoom.onZoom;
      if (typeof cb === 'function') {
        cb(this._zoom, inst.items[inst.idx], inst);
      }
    },
    _applyTransform: function () {
      var $img = this.$stage.find('.cv-image');
      if (!$img.length) {
        return;
      }
      /* Center at stage (50%,50%), then pan, then scale from center so image/GIF stays fixed at center */
      $img.css('transform', 'translate(-50%, -50%) translate(' + this._panX + 'px,' + this._panY + 'px) scale(' + this._zoom + ')');
      $img.css('cursor', (this._zoom > 1 && !this._isGifItem()) ? 'grab' : '');
    },
    _clampPan: function () {
      /* GIF: keep fixed at center – no pan, zoom only; static images can pan */
      if (this._isGifItem()) {
        this._panX = 0; this._panY = 0; return;
      }
      if (this._zoom <= 1) {
        this._panX = 0; this._panY = 0; return;
      }
      var stage = this.$stageWrap[0];
      var img = this.$stage.find('.cv-image')[0];
      if (!stage) {
        return;
      }
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      var maxX, maxY;
      if (img && (img.naturalWidth || img.offsetWidth) && (img.naturalHeight || img.offsetHeight)) {
        var nw = img.naturalWidth || img.offsetWidth;
        var nh = img.naturalHeight || img.offsetHeight;
        var scale = Math.min(sw / nw, sh / nh);
        var displayW = nw * scale;
        var displayH = nh * scale;
        maxX = Math.max(0, (displayW * this._zoom - sw) / 2);
        maxY = Math.max(0, (displayH * this._zoom - sh) / 2);
      } else {
        maxX = Math.max(0, (this._zoom - 1) * sw / 2);
        maxY = Math.max(0, (this._zoom - 1) * sh / 2);
      }
      this._panX = Math.max(-maxX, Math.min(maxX, this._panX));
      this._panY = Math.max(-maxY, Math.min(maxY, this._panY));
    },
    _resetZoomPan: function () {
      this._zoom = 1; this._panX = 0; this._panY = 0;
      this._isPanning = false; this._pinchStartDist = 0; this._justEndedPinch = false;
      this._highResLoaded = false; this._highResLoading = false;
      if (this._highResSliderDebounceTimer != null) {
        clearTimeout(this._highResSliderDebounceTimer);
        this._highResSliderDebounceTimer = null;
      }
      this._syncSlider();
    },
    _touchDist: function (t) {
      var dx = t[0].clientX - t[1].clientX,
        dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },
    _loadHighResImageIfNeeded: function () {
      var inst = this.activeInstance;
      if (!inst || !inst.items || inst.idx < 0) {
        return;
      }
      if (!this._isImageItem || this._isGifItem() || this._highResLoading) {
        return;
      }
      var zo = this._zoomOpts();
      var threshold = zo.loadHighResUrlAt;
      if (threshold === false || threshold == null || this._zoom <= threshold || this._highResLoaded) {
        return;
      }
      var item = inst.items[inst.idx];
      var resolvedZoom = getResolvedUrl(item, inst, 'zoomUrl');
      var highResUrl = (resolvedZoom && isSafeResourceUrl(resolvedZoom)) ? resolvedZoom : ((item.zoomUrl && isSafeResourceUrl(item.zoomUrl)) ? item.zoomUrl : null) || getItemDownloadUrl(item);
      if (!highResUrl) {
        return;
      }
      var $img = this.$stage.find('.cv-image');
      if (!$img.length) {
        return;
      }
      var currentSrc = $img.attr('src') || '';
      if (currentSrc === highResUrl) {
        this._highResLoaded = true;
        return;
      }
      this._highResLoading = true;
      this.$loader.addClass('cv-active');
      var self = this;
      /* Load in place so the browser uses the same img and cache; URL is never modified (no cache-busting) so repeat visits use cache */
      var imgEl = $img[0];
      var onDone = function () {
        if (!self.activeInstance || self.activeInstance !== inst) {
          self._highResLoading = false;
          self.$loader.removeClass('cv-active');
          return;
        }
        self._highResLoading = false;
        self._highResLoaded = true;
        self.$loader.removeClass('cv-active');
        self._clampPan();
        self._applyTransform();
      };
      $img.one('load', onDone).one('error', function () {
        self._highResLoading = false;
        self.$loader.removeClass('cv-active');
      });
      imgEl.src = highResUrl;
      /* If already cached, load may not fire; check after a tick */
      setTimeout(function () {
        if (!self._highResLoading) {
          return;
        }
        if (imgEl.complete && imgEl.naturalWidth) {
          $img.off('load error');
          onDone();
        }
      }, 0);
    },

    /* open / close */
    open: function (instance) {
      this.ensure();
      this.activeInstance = instance;
      this._swipeTracking = false;
      if (instance.opts.wcag) {
        this._focusBeforeOpen = document.activeElement;
        this.$el[0].setAttribute('aria-hidden', 'false');
        this.$shell[0].setAttribute('role', 'dialog');
        this.$shell[0].setAttribute('aria-modal', 'true');
        this.$shell[0].setAttribute('aria-labelledby', 'cv-dialog-title');
        this.$shell[0].setAttribute('aria-describedby', 'cv-dialog-desc');
        this.$title[0].setAttribute('aria-live', 'polite');
        this.$counter[0].setAttribute('aria-live', 'polite');
        this.$el.find('.cv-close').attr('aria-label', str(instance, 'close'));
        this.$el.find('.cv-carousel-toggle').attr('aria-label', str(instance, 'attachments'));
        this.$el.find('.cv-nav-prev').attr('aria-label', str(instance, 'previousItem'));
        this.$el.find('.cv-nav-next').attr('aria-label', str(instance, 'nextItem'));
        this.$el.find('.cv-zoom-out-btn').attr('aria-label', str(instance, 'zoomOut'));
        this.$el.find('.cv-zoom-slider').attr('aria-label', str(instance, 'zoomLevel'));
        this.$el.find('.cv-zoom-in-btn').attr('aria-label', str(instance, 'zoomIn'));
        this.$carouselPrev.attr('aria-label', str(instance, 'scrollCarouselLeft'));
        this.$carouselNext.attr('aria-label', str(instance, 'scrollCarouselRight'));
      } else {
        this.$el[0].removeAttribute('aria-hidden');
        this.$shell[0].removeAttribute('role');
        this.$shell[0].removeAttribute('aria-modal');
        this.$shell[0].removeAttribute('aria-labelledby');
        this.$shell[0].removeAttribute('aria-describedby');
        this.$title[0].removeAttribute('aria-live');
        this.$counter[0].removeAttribute('aria-live');
        this.$el.find('.cv-close, .cv-carousel-toggle, .cv-nav-prev, .cv-nav-next, .cv-zoom-out-btn, .cv-zoom-slider, .cv-zoom-in-btn').removeAttr('aria-label');
        this.$carouselPrev.add(this.$carouselNext).removeAttr('aria-label');
        this.$themeToggle.removeAttr('aria-label');
        this.$fullscreenToggle.removeAttr('aria-label');
        this.$commentToggle.removeAttr('aria-label');
      }
      var theme = instance.opts.theme || 'dark';
      this.$el[0].className = 'cv-overlay cv-theme-' + theme;
      this.$themeToggle.toggle(instance.opts.themeToggle !== false);
      this._syncThemeToggle();
      var zo = instance.opts.zoom || DEFAULTS.zoom;
      this.$zoomSlider.attr({ min: zo.min, max: zo.max, step: zo.step });
      this._updateNavButtons(instance);
      this._carouselOpen = false;
      if (this._carouselEnabled(instance) && instance.items.length > 0) {
        this.$carouselToggle.show();
        this._buildCarousel(instance);
        this.$carouselWrap.removeClass('cv-open');
        this.$carouselToggle.attr('aria-expanded', 'false').removeClass('cv-active');
        this._updateCarouselNavVisibility(instance);
      } else {
        this.$carouselToggle.hide().removeClass('cv-active');
        this.$carouselWrap.removeClass('cv-open');
      }
      this.$fullscreenToggle.toggle(instance.opts.fullscreen !== false);
      this._syncFullscreenToggle();
      this._applyTooltips(instance);
      if (this._stageOnlyEnabled(instance)) {
        this.$shell.addClass('cv-stage-only');
      } else {
        this.$shell.removeClass('cv-stage-only');
      }
      if (this._stageOnlyEnabled(instance) && instance.opts.slideshow && instance.opts.slideshow.enabled && instance.items.length > 1) {
        this.$shell.addClass('cv-slideshow-visible');
      } else {
        this.$shell.removeClass('cv-slideshow-visible');
      }
      this.$el.addClass('cv-visible');
      this.visible = true;
      /* Prevent page scroll behind overlay (QMS / UX) */
      this._bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      var self = this;
      $(window).off('resize.cv-extract-overlay').on('resize.cv-extract-overlay', function () {
        if (!self.visible || !self.$stage || !self.$stage.length) {
          return;
        }
        if (self.$stage.find('.cv-extract-overlay').length) {
          removeExtractOverlay(self.$stage);
          if (self.$toolbar && self.$toolbar.length) {
            self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
          }
        }
      });
      if (instance._beforeOpenPhase === 'loading') {
        this._enterBeforeOpenLoading(instance);
      } else if (instance._pendingGateContent && instance._pendingGateContent.html) {
        this._showGateContent(instance);
      } else {
        this.loadItem();
      }
      if (instance.opts.wcag) {
        var self = this;
        setTimeout(function () {
          var el;
          if (self._stageOnlyEnabled(instance) && !self._stageOnlyHideNav(instance)) {
            el = self.$prev.is(':visible') ? self.$prev[0] : self.$next[0];
          } else if (!self._stageOnlyEnabled(instance)) {
            el = self.$el.find('.cv-close')[0];
          } else {
            el = self.$el.find('.cv-close')[0] || self.$stage[0];
          }
          if (el) {
            el.focus();
          }
        }, 0);
      }
    },

    _updateNavButtons: function (inst) {
      if (!inst || inst.items.length <= 1) {
        this.$prev.hide();
        this.$next.hide();
        return;
      }
      if (this._stageOnlyEnabled(inst) && this._stageOnlyHideNav(inst)) {
        this.$prev.hide();
        this.$next.hide();
        return;
      }
      if (inst.opts.loop) {
        this.$prev.show();
        this.$next.show();
      } else {
        this.$prev.toggle(inst.idx > 0);
        this.$next.toggle(inst.idx < inst.items.length - 1);
      }
    },

    /**
     * Preload adjacent images so next/prev to an image shows instantly (Colorbox-style).
     * When the current item is loaded, start loading the next and previous item if they are images.
     */
    _preloadAdjacentImages: function (inst) {
      if (!inst || !inst.items.length || inst.opts.preloadAdjacentImages === false) {
        return;
      }
      var n = inst.items.length;
      var nextIdx;
      var prevIdx;
      if (inst.opts.loop) {
        nextIdx = (inst.idx + 1) % n;
        prevIdx = (inst.idx - 1 + n) % n;
      } else {
        nextIdx = (inst.idx + 1 < n) ? inst.idx + 1 : -1;
        prevIdx = (inst.idx - 1 >= 0) ? inst.idx - 1 : -1;
      }
      var preload = function (item) {
        if (!item || (item.type || 'image') !== 'image') {
          return;
        }
        var src = getResolvedSrcUrl(item, inst) || item.src;
        if (!src || !isSafeResourceUrl(src)) {
          return;
        }
        var img = new Image();
        img.src = src;
      };
      if (nextIdx >= 0) {
        preload(inst.items[nextIdx]);
      }
      if (prevIdx >= 0 && prevIdx !== nextIdx) {
        preload(inst.items[prevIdx]);
      }
    },

    /**
     * Build the carousel strip of thumbnails for all items. Clicking a thumb calls goTo(index).
     * Video/audio show thumbnailUrl with a play icon overlay.
     */
    _carouselEnabled: function (inst) {
      if (!inst) {
        return false;
      }
      var c = inst.opts.carousel;
      return Boolean(c && c.enabled);
    },
    _carouselNavThreshold: function (inst) {
      if (!inst) {
        return 4;
      }
      var c = inst.opts.carousel;
      return (c && c.navThreshold !== null && c.navThreshold !== undefined) ? c.navThreshold : 4;
    },
    _stageOnlyEnabled: function (inst) {
      if (!inst || !inst.opts.stageOnly) {
        return false;
      }
      var so = inst.opts.stageOnly;
      return so === true || (so && so.enabled === true);
    },
    _stageOnlyHideNav: function (inst) {
      if (!inst || !inst.opts.stageOnly || typeof inst.opts.stageOnly !== 'object') {
        return false;
      }
      return inst.opts.stageOnly.hideNavigation === true;
    },
    _buildCarousel: function (inst) {
      var self = this;
      this.$carousel.empty();
      var items = inst.items;
      var truncate = function (s, maxLen) {
        if (isNullish(s) || s === '') {
          return '';
        }
        var str = String(s).trim();
        if (str.length <= maxLen) {
          return str;
        }
        return str.slice(0, maxLen - 1) + '…';
      };
      for (var i = 0; i < items.length; i++) {
        (function (idx) {
          var item = items[idx];
          var type = item.type || 'image';
          if ((type === 'audio' || type === 'video') && isImageLikeExtension(item)) {
            type = 'image';
          }
          var thumbSrc = null;
          var resolvedThumb = getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
          var resolvedItemSrc = getResolvedUrl(item, inst, 'src') || item.src;
          if (type === 'image' && (resolvedThumb || resolvedItemSrc) && isSafeResourceUrl(resolvedThumb || resolvedItemSrc)) {
            thumbSrc = (resolvedThumb && isSafeResourceUrl(resolvedThumb)) ? resolvedThumb : resolvedItemSrc;
          } else if ((type === 'video' || type === 'audio') && resolvedThumb && isSafeResourceUrl(resolvedThumb)) {
            thumbSrc = resolvedThumb;
          }
          var typeLabel;
          if (type === 'pdf') {
            typeLabel = 'PDF';
          } else if (type === 'video') {
            typeLabel = 'Video';
          } else if (type === 'audio') {
            typeLabel = 'Audio';
          } else if (type === 'inline') {
            typeLabel = 'Code';
          } else if (type === 'markdown') {
            typeLabel = 'MD';
          } else if (type === 'html') {
            typeLabel = 'HTML';
          } else if (type === 'error') {
            typeLabel = '—';
          } else {
            typeLabel = (item.fileExt || type).slice(0, 4);
          }
          var title = (!isNullish(item.title) && item.title !== '') ? String(item.title).trim() : '';
          var $item = $('<button type="button" class="cv-carousel-item" data-cv-index="' + idx + '"></button>');
          if (thumbSrc) {
            var $img = $('<img class="cv-carousel-thumb" alt="">').attr('src', thumbSrc);
            $img.on('error', function () {
              $item.addClass('cv-carousel-no-thumb');
            });
            $item.append($img);
            if (type === 'video' || type === 'audio') {
              $item.append($('<span class="cv-carousel-play-icon">' + Icons.play + '</span>'));
            }
          } else {
            $item.addClass('cv-carousel-no-thumb').text(title ? truncate(title, 12) : typeLabel);
          }
          if (title) {
            $item.attr('title', title);
          }
          if (inst.opts.wcag) {
            $item.attr('aria-label', str(inst, 'carouselItemLabel').replace('%1', String(idx + 1)).replace('%2', String(inst.items.length)));
          }
          $item.on('click', function (e) {
            e.preventDefault();
            if (inst !== self.activeInstance) {
              return;
            }
            if (idx === inst.idx) {
              return;
            }
            inst.goTo(idx);
          });
          self.$carousel.append($item);
        }(i));
      }
      this._updateCarouselSelection(inst);
      this._updateCarouselNavVisibility(inst);
    },

    _updateCarouselNavVisibility: function (inst) {
      if (!inst || !this._carouselEnabled(inst)) {
        return;
      }
      var threshold = this._carouselNavThreshold(inst);
      var showNav = inst.items.length > threshold;
      this.$carouselPrev.toggle(showNav);
      this.$carouselNext.toggle(showNav);
    },

    _updateCarouselSelection: function (inst) {
      if (!inst || !this._carouselEnabled(inst)) {
        return;
      }
      this.$carousel.find('.cv-carousel-item').removeClass('cv-active').attr('aria-current', null);
      var $current = this.$carousel.find('.cv-carousel-item[data-cv-index="' + inst.idx + '"]');
      $current.addClass('cv-active').attr('aria-current', 'true');
      var el = $current[0];
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    },

    _syncThemeToggle: function () {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var theme = inst.opts.theme || 'dark';
      var label = str(inst, theme === 'dark' ? 'switchToLightMode' : 'switchToDarkMode');
      if (inst.opts.wcag) {
        this.$themeToggle.attr('aria-label', label);
      }
      this.$themeToggle.html(theme === 'dark' ? Icons.themeLight : Icons.themeDark);
      this._applyTooltips(inst);
    },

    _syncFullscreenToggle: function () {
      var el = getFullscreenElement();
      var isOverlayFullscreen = (el === this.$el[0]);
      var inst = this.activeInstance;
      var key = isOverlayFullscreen ? 'exitFullscreen' : 'fullscreen';
      var label;
      if (inst) {
        label = str(inst, key);
      } else if (isOverlayFullscreen) {
        label = 'Exit fullscreen';
      } else {
        label = 'Fullscreen';
      }
      if (inst && inst.opts.wcag) {
        this.$fullscreenToggle.attr('aria-label', label);
      }
      this.$fullscreenToggle.html(isOverlayFullscreen ? Icons.fullscreenExit : Icons.fullscreen);
      if (inst && inst.opts.canShowTooltip !== false) {
        this.$fullscreenToggle.attr('data-cv-tooltip', label);
      } else if (inst) {
        this.$fullscreenToggle.removeAttr('data-cv-tooltip');
      }
      if (inst) {
        this._applyTooltips(inst);
      }
      /* Move tooltip into overlay when fullscreen so it appears above fullscreen content; move back to body when exiting */
      if (this.$tooltip && this.$tooltip.length) {
        if (isOverlayFullscreen && this.$tooltip.parent()[0] !== this.$el[0]) {
          this.$el.append(this.$tooltip);
        } else if (!isOverlayFullscreen && this.$tooltip.parent()[0] !== document.body) {
          $('body').append(this.$tooltip);
        }
      }
    },

    _toggleOverlayFullscreen: function () {
      var el = this.$el[0];
      var fsEl = getFullscreenElement();
      var isOurs = (fsEl === el);
      var self = this;
      if (fsEl && isOurs) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
        setTimeout(function () {
          self._syncFullscreenToggle();
        }, 50);
      } else {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
        setTimeout(function () {
          self._syncFullscreenToggle();
        }, 100);
      }
    },

    close: function () {
      if (this.$tooltip && this.$tooltip.length) {
        this.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
        this.$tooltip = $();
      }
      this._hideShortcutsPopup();
      if (!this.activeInstance) {
        if (this._bodyOverflow !== null && this._bodyOverflow !== undefined) {
          document.body.style.overflow = this._bodyOverflow;
          this._bodyOverflow = null;
        }
        return;
      }
      var inst = this.activeInstance,
        item = inst.items[inst.idx];
      var hadWcag = inst.opts.wcag;
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null;
      }
      var fsEl = getFullscreenElement();
      if (fsEl === this.$el[0]) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
      var self = this;
      this.$el.addClass('cv-closing');
      if (typeof inst.opts.onCleanup === 'function' && item) {
        inst.opts.onCleanup(item, inst);
      }
      setTimeout(function () {
        $(window).off('resize.cv-extract-overlay');
        self._destroyCurrent(inst);
        if (typeof inst.opts.onClose === 'function' && item) {
          inst.opts.onClose(item, inst);
        }
        self.$el.removeClass('cv-visible cv-closing');
        document.body.style.overflow = !isNullish(self._bodyOverflow) ? self._bodyOverflow : '';
        self._bodyOverflow = null;
        if (hadWcag) {
          self.$el[0].setAttribute('aria-hidden', 'true');
        }
        if (hadWcag) {
          if (self.$title[0]) {
            self.$title[0].removeAttribute('aria-live');
          }
          if (self.$counter[0]) {
            self.$counter[0].removeAttribute('aria-live');
          }
        }
        self.$stage.empty(); self.$loader.removeClass('cv-active');
        self._clearToolbarToggleActiveStates();
        self._resetZoomPan();
        self._swipeTracking = false;
        if (inst) {
          inst._openContext = null;
          inst._pendingGateContent = null;
          inst._beforeOpenPhase = null;
        }
        self.visible = false; self.activeInstance = null;
        if (hadWcag && self._focusBeforeOpen && typeof self._focusBeforeOpen.focus === 'function') {
          self._focusBeforeOpen.focus();
        }
        self._focusBeforeOpen = null;
        if (self._stripMessageTimer) {
          clearTimeout(self._stripMessageTimer); self._stripMessageTimer = null;
        }
        /* Remove overlay from DOM so it is recreated on next open (avoids keeping heavy content in DOM) */
        if (self.$el && self.$el.length) {
          self.$el.remove();
        }
        self.built = false;
        self.$el = null;
        self.$shell = null; self.$stage = null; self.$stageWrap = null; self.$toolbar = null;
        self.$loader = null; self.$prev = null; self.$next = null; self.$footer = null;
      }, 300);
    },

    _enterBeforeOpenLoading: function (instance) {
      this._destroyCurrent(instance);
      this.$stage.empty();
      this.$loader.addClass('cv-active');
      this.$footer.hide();
      this.$toolbar.empty();
      this.$pollOption.removeClass('cv-active').empty().hide();
      this.$counter.closest('.cv-header-left').hide();
      this.$prev.hide();
      this.$next.hide();
      if (this._carouselEnabled(instance)) {
        this.$carouselToggle.hide();
      }
      this._clearToolbarToggleActiveStates();
      var item = instance.items[instance.idx];
      this.$title.text((item && !isNullish(item.title) && item.title !== '') ? String(item.title) : '');
      this.$title.closest('.cv-header-center').show();
    },

    _finishBeforeOpenProceed: function (instance) {
      if (!instance || this.activeInstance !== instance) {
        return;
      }
      if (instance._pendingGateContent && instance._pendingGateContent.html) {
        instance._beforeOpenPhase = 'gate';
        this._showGateContent(instance);
      } else {
        instance._beforeOpenPhase = null;
        this.loadItem();
      }
    },

    _showGateContent: function (instance) {
      var gate = instance._pendingGateContent;
      if (!gate || !gate.html) {
        instance._beforeOpenPhase = null;
        this.loadItem();
        return;
      }
      var self = this;
      this.$stage.empty().append(gate.html);
      this.$title.text('');
      this.$counter.closest('.cv-header-left').hide();
      this.$prev.hide();
      this.$next.hide();
      if (this._carouselEnabled(instance)) {
        this.$carouselToggle.hide();
      }
      this.$footer.hide();
      this.$toolbar.empty();
      this.$pollOption.removeClass('cv-active').empty().hide();
      this.$loader.removeClass('cv-active');
      this._clearToolbarToggleActiveStates();
      var $proceed = this.$stage.find('[data-cv-gate-proceed]');
      $proceed.off('click.cv-gate').on('click.cv-gate', function (e) {
        e.preventDefault();
        var opts = (typeof gate.onProceed === 'function') ? gate.onProceed() : {};
        instance._openContext = opts || {};
        instance._pendingGateContent = null;
        instance._beforeOpenPhase = null;
        $proceed.off('click.cv-gate');
        self.loadItem();
      });
    },

    /* load item */
    loadItem: function (opts) {
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      var item = inst.items[inst.idx];
      if (!item) {
        return;
      }
      if (this._carouselEnabled(inst) && inst.items.length > 0) {
        this._buildCarousel(inst);
        this._updateCarouselSelection(inst);
        this._updateCarouselNavVisibility(inst);
      }
      opts = opts || {};
      var useTransition = opts.transition && this.$stage.children().length > 0;
      if (useTransition) {
        var self = this;
        this.$stageWrap.addClass('cv-stage-out');
        setTimeout(function () {
          self.$stageWrap.removeClass('cv-stage-out');
          self._loadItemCore(inst, true);
        }, 280);
        return;
      }
      this._loadItemCore(inst, false);
    },

    _loadItemCore: function (inst, fadeIn) {
      var item = inst.items[inst.idx];
      if (!item) {
        return;
      }

      if (typeof inst.opts.onLoading === 'function') {
        inst.opts.onLoading(item, inst);
      }

      this._destroyCurrent(inst);
      this.$stage.empty(); this.$loader.removeClass('cv-active');
      this._clearToolbarToggleActiveStates();
      this._resetZoomPan();

      /* Use .text() so item.title (fileName) is never interpreted as HTML — XSS-safe */
      this.$title.text(!isNullish(item.title) && item.title !== '' ? String(item.title) : '');
      this.$counter.text((inst.idx + 1) + ' / ' + inst.items.length);
      var type = item.type || 'image';
      /* For type html: hide title/counter when no title given */
      if (type === 'html') {
        var hasTitle = (!isNullish(item.title) && item.title !== '');
        this.$title.closest('.cv-header-center').toggle(hasTitle);
        this.$counter.closest('.cv-header-left').toggle(hasTitle);
      } else {
        this.$title.closest('.cv-header-center').show();
        this.$counter.closest('.cv-header-left').show();
      }
      if (inst.opts.showCounter === false) {
        this.$counter.closest('.cv-header-left').hide();
      }

      var result = null;
      this._isCustomRendered = false;
      this._isImageItem = false;
      this._isPdfItem = false;
      this._isHtmlItem = false;

      /* 1. onRender (customer full override — first shot) */
      if (typeof inst.opts.onRender === 'function') {
        result = inst.opts.onRender(item, this.$stage, inst);
        if (this.$stage.children().length > 0) {
          this._isCustomRendered = true;
        }
      }

      /* 2. Built-in renderers (if onRender didn't handle it) */
      if (!this._isCustomRendered) {
        this._isImageItem = (type === 'image');
        this._isPdfItem = (type === 'pdf');
        this._isHtmlItem = (type === 'html');
        if (type === 'image') {
          result = builtInImageRenderer(item, this.$stage);
        } else if (type === 'video') {
          result = builtInVideoRenderer(item, this.$stage, inst);
        } else if (type === 'audio') {
          result = builtInAudioRenderer(item, this.$stage, inst);
        } else if (type === 'pdf') {
          result = builtInPdfRenderer(item, this.$stage, inst);
        } else if (type === 'inline') {
          result = builtInInlineRenderer(item, this.$stage, inst);
        } else if (type === 'markdown') {
          result = builtInMarkdownRenderer(item, this.$stage, inst);
        } else if (type === 'error') {
          result = builtInErrorRenderer(item, this.$stage);
        } else if (type === 'html') {
          result = builtInHtmlRenderer(item, this.$stage);
        }
      }

      /* 3. Unsupported fallback */
      if (this.$stage.children().length === 0) {
        builtInUnsupportedRenderer(item, this.$stage);
      }

      /* 3b. PDF: stretch body > stage-wrap > stage so .cv-pdf-main gets a bounded height and can scroll */
      var $body = this.$el.find('.cv-body');
      if (this._isPdfItem) {
        $body.addClass('cv-body-pdf');
        this.$stageWrap.addClass('cv-stage-wrap-pdf');
        this.$stage.addClass('cv-stage-pdf');
      } else {
        $body.removeClass('cv-body-pdf');
        this.$stageWrap.removeClass('cv-stage-wrap-pdf');
        this.$stage.removeClass('cv-stage-pdf');
      }

      /* 4. Light-stage class so nav arrows are visible (image/inline/markdown often have light stage bg) */
      if (type === 'image' || type === 'inline' || type === 'markdown') {
        this.$shell.addClass('cv-stage-light-bg');
      } else {
        this.$shell.removeClass('cv-stage-light-bg');
      }

      /* 4b. Attachment comment panel (single or multiple comments; normalized array + optional prev/next) */
      var commentList = this._normalizeComments(item);
      var showCommentOpt = Boolean(inst.opts.showAttachmentComment);
      if (showCommentOpt && commentList.length > 0) {
        this._commentList = commentList;
        this._commentIndex = 0;
        this._renderCommentAt(inst, commentList, 0);
        if (commentList.length > 1) {
          this.$commentNav.show();
          if (inst.opts.wcag) {
            this.$commentPrev.attr('aria-label', str(inst, 'commentPrev'));
            this.$commentNext.attr('aria-label', str(inst, 'commentNext'));
          }
        } else {
          this.$commentNav.hide();
        }
        if (this._commentPanelVisible === undefined) {
          this._commentPanelVisible = true;
        }
        this.$commentWrap.toggle(this._commentPanelVisible).attr('aria-hidden', !this._commentPanelVisible);
        this.$commentToggle.show().attr('aria-expanded', this._commentPanelVisible).toggleClass('cv-active', this._commentPanelVisible);
        if (inst.opts.canShowTooltip !== false) {
          this.$commentToggle.attr('data-cv-tooltip', str(inst, 'toggleComment'));
        }
        if (inst.opts.wcag) {
          this.$commentToggle.attr('aria-label', str(inst, 'toggleComment'));
        }
      } else {
        this._commentList = null;
        this.$commentTitle.empty();
        this.$commentAuthor.empty();
        this.$commentInner.empty();
        this.$commentNav.hide();
        this.$commentWrap.hide().attr('aria-hidden', 'true');
        this.$commentToggle.hide().removeClass('cv-active');
      }

      inst._currentResult = result || {};
      if (type === 'inline' && result && result.inlineContent !== null && result.inlineContent !== undefined) {
        inst._inlineContent = result.inlineContent;
      }

      /* 5. Resolve toolbar */
      this._resolveToolbar(inst, result || {});

      /* 6. Poll option (above toolbar) */
      this._updatePollOption(inst, item);

      /* 7. Footer visible if toolbar/zoom or poll option row is shown (not for image error) */
      if (this.$pollOption.hasClass('cv-active') && !(result && result.imageError)) {
        this.$footer.show();
      }

      /* 8. Update prev/next visibility (when loop: false, hide at first/last) */
      this._updateNavButtons(inst);

      /* 9. Preload adjacent images so next/prev to image shows instantly */
      this._preloadAdjacentImages(inst);

      /* 10. Update carousel active state */
      this._updateCarouselSelection(inst);

      /* 11. onOpen */
      if (typeof inst.opts.onOpen === 'function') {
        inst.opts.onOpen(item, this.$stage, inst);
      }

      /* 11b. onComplete — after content is displayed (sync when no fade, or after fade-in) */
      if (!fadeIn && typeof inst.opts.onComplete === 'function') {
        inst.opts.onComplete(item, inst);
      }

      /* 12. Slideshow — only run when not paused by user */
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null;
      }
      var ss = inst.opts.slideshow;
      if (ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying)) {
        var intervalMs = (!isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
        var advanceMedia = ss.advanceMedia === 'onEnd' ? 'onEnd' : 'interval';
        inst._slideshowPlaying = true;
        if (advanceMedia === 'onEnd') {
          var $media = this.$stage.find('video, audio');
          if ($media.length) {
            $media.one('ended', function () {
              if (inst._slideshowTimer) {
                clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null;
              }
              if (Overlay.activeInstance === inst) {
                inst.next({ transition: true });
              }
            });
            inst._slideshowTimer = setTimeout(function () {
              if (Overlay.activeInstance === inst) {
                inst.next({ transition: true });
              }
            }, intervalMs);
          } else {
            inst._slideshowTimer = setTimeout(function () {
              if (Overlay.activeInstance === inst) {
                inst.next({ transition: true });
              }
            }, intervalMs);
          }
        } else {
          inst._slideshowTimer = setTimeout(function () {
            if (Overlay.activeInstance === inst) {
              inst.next({ transition: true });
            }
          }, intervalMs);
        }
        if (ss.showProgress) {
          this._startSlideshowProgress(intervalMs);
        }
        var $slideBtn = this.$toolbar.find('.cv-slideshow-btn');
        if ($slideBtn.length) {
          $slideBtn.find('.cv-tb-label').text(str(inst, 'pauseSlideshow'));
          if (inst.opts.canShowTooltip !== false) {
            $slideBtn.attr('data-cv-tooltip', str(inst, 'pauseSlideshow'));
          }
        }
      } else {
        this._stopSlideshowProgress();
      }

      if (fadeIn && this.$stage.children().length > 0) {
        var self = this;
        this.$stage.addClass('cv-stage-in');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            self.$stage.addClass('cv-stage-in-visible');
            setTimeout(function () {
              self.$stage.removeClass('cv-stage-in cv-stage-in-visible');
              if (typeof inst.opts.onComplete === 'function') {
                inst.opts.onComplete(item, inst);
              }
            }, 320);
          });
        });
      }
    },

    _destroyCurrent: function (inst) {
      if (inst._currentResult && typeof inst._currentResult.destroy === 'function') {
        inst._currentResult.destroy();
      }
      inst._currentResult = null;
    },

    _startSlideshowProgress: function (intervalMs) {
      if (!this.$slideshowProgressWrap || !this.$slideshowProgressBar.length) {
        return;
      }
      this.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
      this.$slideshowProgressWrap.show();
      var bar = this.$slideshowProgressBar[0];
      if (bar) {
        bar.getBoundingClientRect();
      }
      this.$slideshowProgressBar.css({ transition: 'width ' + intervalMs + 'ms linear', width: '100%' });
    },
    _stopSlideshowProgress: function () {
      if (!this.$slideshowProgressWrap || !this.$slideshowProgressBar.length) {
        return;
      }
      this.$slideshowProgressWrap.hide();
      this.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
    },

    /** Returns a single toolbar item config for the slideshow Play/Pause button. Used when footer would otherwise be hidden (HTML, stageOnly) or in the main toolbar. */
    _slideshowButtonItem: function (inst) {
      var self = this;
      var ss = inst.opts.slideshow;
      if (!ss || !ss.enabled || !inst.items || inst.items.length < 2) {
        return null;
      }
      if (ss.autoStart === true && ss.hideSlideshowButton === true) {
        return null;
      }
      var running = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
      var intervalMs = (!isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
      return {
        id: 'slideshow',
        className: 'cv-slideshow-btn',
        showLabel: true,
        label: running ? str(inst, 'pauseSlideshow') : str(inst, 'playSlideshow'),
        onClick: function () {
          var r = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
          var $btn = self.$toolbar.find('.cv-slideshow-btn');
          if (r) {
            inst._slideshowPaused = true;
            if (inst._slideshowTimer) {
              clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null;
            }
            self._stopSlideshowProgress();
            $btn.find('.cv-tb-label').text(str(inst, 'playSlideshow'));
            if (inst.opts.canShowTooltip !== false) {
              $btn.attr('data-cv-tooltip', str(inst, 'playSlideshow'));
            }
          } else {
            inst._slideshowPaused = false;
            inst._slideshowPlaying = true;
            inst._slideshowTimer = setTimeout(function () {
              if (Overlay.activeInstance === inst) {
                inst.next({ transition: true });
              }
            }, intervalMs);
            if (ss.showProgress) {
              self._startSlideshowProgress(intervalMs);
            }
            $btn.find('.cv-tb-label').text(str(inst, 'pauseSlideshow'));
            if (inst.opts.canShowTooltip !== false) {
              $btn.attr('data-cv-tooltip', str(inst, 'pauseSlideshow'));
            }
          }
        }
      };
    },

    /* toolbar resolution */
    _resolveToolbar: function (inst, result) {
      if (this._isHtmlItem) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        var slideBtn = this._slideshowButtonItem(inst);
        var htmlCi = inst.items[inst.idx];
        var htmlTbOpts = inst.opts.toolbar || {};
        var showHtmlDownload = (htmlTbOpts.download !== false) && getItemDownloadUrl(htmlCi);
        var htmlToolbarItems = slideBtn ? [slideBtn] : [];
        this._buildToolbar(inst, htmlToolbarItems, showHtmlDownload);
        this.$footer.toggle(htmlToolbarItems.length > 0 || showHtmlDownload);
        return;
      }
      if (result && result.imageError) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [], false);
        this.$footer.hide();
        return;
      }
      var slideBtnItem;
      if (this._stageOnlyEnabled(inst) && (slideBtnItem = this._slideshowButtonItem(inst))) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [slideBtnItem], false);
        this.$footer.show();
        return;
      }
      if (this._stageOnlyEnabled(inst)) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [], false);
        this.$footer.hide();
        return;
      }
      var tbOpts = inst.opts.toolbar || {};
      var showZoom = this._isImageItem && !this._isCustomRendered && tbOpts.zoom !== false;
      var zoomOpts = inst.opts.zoom || {};
      var showPct = Boolean(zoomOpts.showPercentage);
      this.$zoomWidget.toggle(showZoom);
      this.$zoomPct.toggle(showZoom && showPct);

      if (this._isCustomRendered) {
        /* onRender full override — use returned toolbar as-is, no auto download */
        var customTb = result.toolbar || [];
        this._buildToolbar(inst, customTb, false);
      } else {
        /* built-in renderer or default */
        var rendererTb = (result && result.toolbar) ? result.toolbar : [];
        var items = [];

        if (rendererTb.length) {
          items = items.concat(rendererTb);
        }

        var userItems = inst.opts.toolbarItems || [];
        if (userItems.length) {
          if (items.length) {
            items.push('separator');
          }
          items = items.concat(userItems);
        }

        /* Slideshow Play/Pause button when slideshow enabled and more than one item (button first, then separator) */
        var slideBtnItem2 = this._slideshowButtonItem(inst);
        if (slideBtnItem2) {
          if (items.length > 0) {
            items.unshift('separator');
          }
          items.unshift(slideBtnItem2);
        }

        var currentType = (inst.items[inst.idx] && inst.items[inst.idx].type) || '';
        var self = this;

        /* Inline and Markdown: Copy button (icon only; label in tooltip) — copy content to clipboard, show "Copied to clipboard" in tooltip */
        if (currentType === 'inline' || currentType === 'markdown') {
          if (items.length > 0) {
            items.push('separator');
          }
          items.push({
            id: 'copy',
            icon: Icons.copy,
            label: str(inst, 'copy'),
            showLabel: false,
            className: 'cv-tb-copy',
            onClick: function () {
              var content = currentType === 'inline' ? inst._inlineContent : inst._markdownRaw;
              if (!isNullish(content)) {
                copyTextToClipboard(content, inst);
              }
            }
          });
        }

        /* Markdown: toggle raw/source view when markdown.toggleRawView is true */
        var mdOpts = inst.opts.markdown;
        if (currentType === 'markdown' && mdOpts && mdOpts.toggleRawView) {
          if (isNullish(inst._markdownViewMode)) {
            inst._markdownViewMode = 'rendered';
          }
          if (items.length > 0) {
            items.push('separator');
          }
          items.push({
            id: 'markdown-toggle',
            icon: Icons.extractText,
            label: inst._markdownViewMode === 'rendered' ? str(inst, 'viewSource') : str(inst, 'viewMarkdown'),
            showLabel: false,
            className: 'cv-tb-markdown-toggle',
            onClick: function () {
              if (inst._markdownViewMode === 'rendered') {
                if (!isNullish(inst._markdownRaw)) {
                  self.$stage.empty().append(
                    $('<div class="cv-inline-wrap"><div class="cv-inline-body">' + getInlineBodyHtml(inst._markdownRaw, (inst.items && inst.items[inst.idx]) ? inst.items[inst.idx] : {}, inst) + '</div></div>')
                  );
                  inst._markdownViewMode = 'raw';
                }
              } else if (!isNullish(inst._markdownHtml)) {
                self.$stage.empty().append($('<div class="cv-markdown-body"></div>').html(inst._markdownHtml));
                inst._markdownViewMode = 'rendered';
              }
              var $btn = self.$toolbar.find('.cv-tb-markdown-toggle');
              if ($btn.length && inst.opts.canShowTooltip !== false) {
                var lbl = inst._markdownViewMode === 'rendered' ? str(inst, 'viewSource') : str(inst, 'viewMarkdown');
                $btn.attr('data-cv-tooltip', lbl);
              }
            }
          });
        }

        /* Image: Extract text button when toolbar.extractText is true and host provides canShowExtractText + extractText */
        if (currentType === 'image' || (!currentType && this._isImageItem)) {
          var canShowFn = inst.opts.canShowExtractText;
          var extractFn = inst.opts.extractText;
          if (tbOpts.extractText === true && typeof canShowFn === 'function' && typeof extractFn === 'function') {
            var currentItem = inst.items[inst.idx];
            if (canShowFn(currentItem, inst)) {
              if (items.length > 0) {
                items.push('separator');
              }
              items.push({
                id: 'extract-text',
                icon: Icons.extractText,
                label: str(inst, 'extractText'),
                showLabel: false,
                className: 'cv-tb-extract-text',
                onClick: (function (eFn) {
                  return function (clickedItem, clickedInst) {
                    var $existing = self.$stage.find('.cv-extract-overlay');
                    if ($existing.length) {
                      $existing.remove();
                      self.$toolbar.find('.cv-tb-extract-text').removeClass('cv-active');
                      return;
                    }
                    self.$loader.addClass('cv-active');
                    eFn(clickedItem, clickedInst, function (resp) {
                      self.$loader.removeClass('cv-active');
                      if (!resp || !resp.data) {
                        return;
                      }
                      removeExtractOverlay(self.$stage);
                      var $img = self.$stage.find('.cv-image');
                      var $overlay = buildExtractOverlay($img, resp);
                      if ($overlay) {
                        var $wrap = $img.closest('.cv-img-wrap');
                        if ($wrap.length) {
                          $overlay.find('.cv-extract-layer').css({
                            width: $img.width(),
                            height: $img.height()
                          });
                          $wrap.append($overlay);
                          self.$toolbar.find('.cv-tb-extract-text').addClass('cv-active');
                        }
                      }
                    }, function (message) {
                      self.$loader.removeClass('cv-active');
                      self._showStripMessage(message || '');
                    });
                  };
                }(extractFn))
              });
            }
          }
        }

        /* onToolbar callback — let customer modify */
        if (typeof inst.opts.onToolbar === 'function') {
          var modified = inst.opts.onToolbar(inst.items[inst.idx], items.slice(), inst);
          if ($.isArray(modified)) {
            items = modified;
          }
        }

        /* Show download button only if toolbar.download is enabled and item has a download URL (from itemData) */
        var ci = inst.items[inst.idx];
        var showDownload = (tbOpts.download !== false) && getItemDownloadUrl(ci);
        this._buildToolbar(inst, items, showDownload);
      }

      var hasContent = this.$toolbar.children().length > 0 || showZoom;
      this.$footer.toggle(hasContent);
    },

    _updatePollOption: function (inst, item) {
      var opts = inst.opts.pollOption;
      this.$pollOption.removeClass('cv-active').empty();
      if (this._isHtmlItem) {
        return;
      }
      if (!opts || !opts.enabled || isNullish(item.pollOptionLabel) || String(item.pollOptionLabel).trim() === '') {
        return;
      }

      var mode = (opts.mode === 'checkbox') ? 'checkbox' : 'radio';
      var value = (!isNullish(item.pollOptionId)) ? String(item.pollOptionId) : ('idx-' + inst.idx);

      if (mode === 'radio') {
        if (inst._pollSelectedValue === undefined) {
          inst._pollSelectedValue = null;
        }
      } else if (!inst._pollSelectedSet) {
        inst._pollSelectedSet = new Set();
      }

      var isSelected = item.pollOptionSelected === true || item.pollOptionSelected === 'true' || item.pollOptionSelected === 1;
      if (isSelected) {
        if (mode === 'radio') {
          inst._pollSelectedValue = value;
        } else {
          inst._pollSelectedSet.add(value);
        }
      }

      var isChecked = mode === 'radio' ?
        (inst._pollSelectedValue === value) :
        inst._pollSelectedSet.has(value);

      var radioName = 'cv-poll-' + inst.id;
      var inputId = 'cv-poll-input-' + inst.id + '-' + value.replace(/[^a-z0-9-]/gi, '-');
      var inputHtml = mode === 'radio' ?
        '<input type="radio" name="' + escHtml(radioName) + '" value="' + escHtml(value) + '" id="' + escHtml(inputId) + '"' + (isChecked ? ' checked' : '') + '>' :
        '<input type="checkbox" id="' + escHtml(inputId) + '" value="' + escHtml(value) + '"' + (isChecked ? ' checked' : '') + '>';

      var updatedText = str(inst, 'pollUpdated');
      var $wrap = $(
        '<div class="cv-poll-option-inner">' +
          '<label class="cv-poll-option-label-wrap">' + inputHtml +
          '<span class="cv-poll-option-label">' + escHtml(String(item.pollOptionLabel)) + '</span></label>' +
          '<span class="cv-poll-option-updated cv-hidden" aria-live="polite">' + escHtml(updatedText) + '</span>' +
        '</div>'
      );
      this.$pollOption.append($wrap).addClass('cv-active');

      var $updatedSpan = $wrap.find('.cv-poll-option-updated');
      $wrap.find('input').on('change', function () {
        var checked = this.checked;
        if (mode === 'radio') {
          inst._pollSelectedValue = checked ? value : null;
        } else if (checked) {
          inst._pollSelectedSet.add(value);
        } else {
          inst._pollSelectedSet.delete(value);
        }
        if (typeof opts.onSelect === 'function') {
          opts.onSelect(item, checked, inst, item.$el ? item.$el[0] : null);
        }
        $updatedSpan.removeClass('cv-hidden');
        clearTimeout(inst._pollUpdatedTimer);
        inst._pollUpdatedTimer = setTimeout(function () {
          $updatedSpan.addClass('cv-hidden');
        }, 3000);
      });
    },

    _buildToolbar: function (inst, items, showDownload) {
      var $tb = this.$toolbar;
      $tb.empty();
      this._resolvedToolbarItems = items || [];

      this._renderToolbarItems($tb, items, inst);

      if (showDownload) {
        if ($tb.children().length > 0) {
          $tb.append('<span class="cv-tb-sep"></span>');
        }
        var dlTitle = (inst.opts.canShowTooltip !== false) ? (' data-cv-tooltip="' + escHtml(str(inst, 'download')) + '"') : '';
        var $dl = $('<button class="cv-tb-btn cv-tb-download" type="button"' + dlTitle + '>' + Icons.download + '</button>');
        $dl.on('click', function (e) {
          e.preventDefault();
          performDownload(inst.items[inst.idx], inst);
        });
        $tb.append($dl);
      }
    },

    _isToolbarBtnVisible: function (sel) {
      var $b = this.$toolbar.find(sel);
      return $b.length && $b.is(':visible');
    },

    /** Remove cv-active from all toolbar toggle-style buttons (extract text, PDF extract, two-page, carousel, comment). Call when disabling or clearing content. */
    _clearToolbarToggleActiveStates: function () {
      if (this.$toolbar && this.$toolbar.length) {
        this.$toolbar.find('.cv-tb-extract-text, .cv-tb-pdf-extract, .cv-tb-pdf-twopage').removeClass('cv-active');
      }
      if (this.$carouselToggle && this.$carouselToggle.length) {
        this.$carouselToggle.removeClass('cv-active');
      }
      if (this.$commentToggle && this.$commentToggle.length) {
        this.$commentToggle.removeClass('cv-active');
      }
    },

    _getShortcutsList: function (inst) {
      var list = [];
      if (!inst || !inst.opts.keyboardNav) {
        return list;
      }
      var opts = inst.opts;
      var currentItem = inst.items[inst.idx];
      var tbOpts = opts.toolbar || {};

      list.push({ key: 'Escape', label: str(inst, 'close') });
      if (inst.items.length > 1) {
        list.push({ key: 'ArrowLeft', label: str(inst, 'previousItem') });
        list.push({ key: 'ArrowRight', label: str(inst, 'nextItem') });
      }
      if (this._isImageItem && !this._isCustomRendered && tbOpts.zoom !== false) {
        list.push({ key: '+', label: str(inst, 'zoomIn') });
        list.push({ key: '-', label: str(inst, 'zoomOut') });
      }
      if (this._isPdfItem && this.$toolbar.find('.cv-tb-pdf-zoom-in').length) {
        list.push({ key: '+', label: str(inst, 'zoomIn') });
        list.push({ key: '-', label: str(inst, 'zoomOut') });
      }
      if (this._isToolbarBtnVisible('.cv-tb-pdf-print')) {
        list.push({ key: 'p', label: str(inst, 'print') });
      }
      var hasBuiltInMedia = !this._isCustomRendered && this.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
      if (hasBuiltInMedia) {
        list.push({ key: ' ', label: str(inst, 'playPause') });
        list.push({ key: 'm', label: str(inst, 'muteUnmute') });
        list.push({ key: 'r', label: str(inst, 'cyclePlaybackSpeed') });
      }
      if (this.$stage.find('.cv-jp-hd').length) {
        list.push({ key: 'q', label: str(inst, 'toggleHd') });
      }
      if (this._isToolbarBtnVisible('.cv-tb-download')) {
        list.push({ key: 'd', label: str(inst, 'download') });
      }
      if (opts.fullscreen !== false && this.$fullscreenToggle.length && this.$fullscreenToggle.is(':visible')) {
        var fsEl = getFullscreenElement();
        list.push({ key: 'f', label: fsEl === this.$el[0] ? str(inst, 'exitFullscreen') : str(inst, 'fullscreen') });
      }
      if (opts.themeToggle !== false && this.$themeToggle.length && this.$themeToggle.is(':visible')) {
        list.push({ key: 't', label: str(inst, 'toggleTheme') });
      }
      if (opts.carousel && opts.carousel.enabled && this.$carouselToggle.length && this.$carouselToggle.is(':visible')) {
        list.push({ key: 'c', label: str(inst, 'attachments') });
      }
      if (opts.slideshow && opts.slideshow.enabled && inst.items.length > 1 && this.$toolbar.find('.cv-slideshow-btn').length) {
        list.push({ key: 's', label: str(inst, 'toggleSlideshow') });
      }
      var items = this._resolvedToolbarItems || [];
      for (var i = 0; i < items.length; i++) {
        var tbItem = items[i];
        if (tbItem === 'separator' || tbItem === '-' || tbItem instanceof HTMLElement || tbItem instanceof $) {
          continue;
        }
        if (!tbItem.shortcutKey) {
          continue;
        }
        var isVisible = true;
        if (typeof tbItem.visible === 'function') {
          isVisible = tbItem.visible(currentItem, inst);
        } else if (tbItem.visible === false) {
          isVisible = false;
        }
        if (!isVisible) {
          continue;
        }
        var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
        if (sk && !RESERVED_SHORTCUT_KEYS[sk]) {
          list.push({ key: sk, label: tbItem.label || (tbItem.id ? String(tbItem.id) : sk) });
        }
      }
      if (opts.shortcutsPopup !== false) {
        list.push({ key: '?', label: str(inst, 'showShortcuts') });
      }
      return list;
    },

    _showMediaStateFeedback: function (type) {
      var $wrap = this.$stage.find('.cv-video-wrap').first();
      if (!$wrap.length) {
        return;
      }
      $wrap.find('.cv-jp-state-feedback').remove();
      var svg = '';
      if (type === 'play') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
      } else if (type === 'pause') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      } else if (type === 'mute') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      } else if (type === 'unmute') {
        svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
          } else {
        return;
      }
      var $el = $('<div class="cv-jp-state-feedback">' + svg + '</div>');
      $wrap.append($el);
      var t1 = setTimeout(function () {
        $el.addClass('cv-jp-state-feedback-out');
      }, 900);
      setTimeout(function () {
        clearTimeout(t1);
        $el.remove();
      }, 1300);
    },

    _showStripMessage: function (text, durationMs) {
      if (!this.$stripMessage || !this.$stripMessage.length) {
        return;
      }
      if (this._stripMessageTimer) {
        clearTimeout(this._stripMessageTimer);
        this._stripMessageTimer = null;
      }
      var ms = (durationMs != null && durationMs > 0) ? durationMs : 2000;
      this.$stripMessage.text(text).addClass('cv-strip-visible');
      var self = this;
      this._stripMessageTimer = setTimeout(function () {
        self.$stripMessage.removeClass('cv-strip-visible');
        self._stripMessageTimer = null;
      }, ms);
    },

    _shortcutKeyDisplay: function (key) {
      if (key === ' ') {
        return 'Space';
      }
      if (key === 'Escape') {
        return 'Esc';
      }
      if (key === 'ArrowLeft') {
        return '←';
      }
      if (key === 'ArrowRight') {
        return '→';
      }
      return key.length === 1 ? key.toUpperCase() : key;
    },

    _showShortcutsPopup: function () {
      var self = this;
      var inst = this.activeInstance;
      if (!inst) {
        return;
      }
      this._focusBeforeShortcutsPopup = document.activeElement;
      var list = this._getShortcutsList(inst);
      var title = str(inst, 'keyboardShortcuts');
      var useWcag = Boolean(inst.opts.wcag);
      var html = '<div class="cv-shortcuts-popup-inner"' + (useWcag ? ' tabindex="-1"' : '') + '><div class="cv-shortcuts-popup-title">' + escHtml(title) + '</div><ul class="cv-shortcuts-list">';
      for (var i = 0; i < list.length; i++) {
        var displayKey = this._shortcutKeyDisplay(list[i].key);
        html += '<li><kbd>' + escHtml(displayKey) + '</kbd> <span>' + escHtml(list[i].label) + '</span></li>';
      }
      html += '</ul>';
      if (useWcag) {
        html += '<button type="button" class="cv-shortcuts-popup-close" aria-label="' + escHtml(str(inst, 'close')) + '">' + escHtml(str(inst, 'close')) + '</button>';
      }
      html += '</div>';
      this.$shortcutsPopup.html(html).addClass('cv-open').attr('aria-hidden', 'false');
      if (useWcag) {
        this.$shortcutsPopup.attr('aria-modal', 'true');
        var $closeBtn = this.$shortcutsPopup.find('.cv-shortcuts-popup-close');
        if ($closeBtn.length) {
          $closeBtn.on('click', function () {
            self._hideShortcutsPopup();
          });
        }
      }
      this.$shortcutsPopup.off('click.cv-shortcuts').on('click.cv-shortcuts', function (e) {
        if (e.target === self.$shortcutsPopup[0] || $(e.target).closest('.cv-shortcuts-popup-inner').length === 0) {
          self._hideShortcutsPopup();
        }
      });
      if (useWcag) {
        var $focusTarget = this.$shortcutsPopup.find('.cv-shortcuts-popup-close');
        if ($focusTarget.length) {
          $focusTarget[0].focus();
        } else {
          this.$shortcutsPopup.find('.cv-shortcuts-popup-inner')[0].focus();
        }
      }
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer);
        inst._slideshowTimer = null;
        inst._slideshowHeldByShortcutsPopup = true;
        this._stopSlideshowProgress();
      }
    },

    _hideShortcutsPopup: function () {
      var hadFocus = this._focusBeforeShortcutsPopup;
      this.$shortcutsPopup.removeClass('cv-open').attr('aria-hidden', 'true').removeAttr('aria-modal').empty();
      this._focusBeforeShortcutsPopup = null;
      if (hadFocus && typeof hadFocus.focus === 'function') {
        try {
          hadFocus.focus();
        } catch (err) {}
      }
      var inst = this.activeInstance;
      if (inst && inst._slideshowHeldByShortcutsPopup) {
        inst._slideshowHeldByShortcutsPopup = false;
        var ss = inst.opts.slideshow;
        if (ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying)) {
          var intervalMs = (!isNullish(ss.interval) && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
          inst._slideshowTimer = setTimeout(function () {
            if (Overlay.activeInstance === inst) {
              inst.next({ transition: true });
            }
          }, intervalMs);
          if (ss.showProgress) {
            this._startSlideshowProgress(intervalMs);
          }
        }
      }
    },

    _renderToolbarItems: function ($tb, items, inst) {
      if (!items || !items.length) {
        return;
      }
      var currentItem = inst.items[inst.idx];

      for (var i = 0; i < items.length; i++) {
        var tbItem = items[i];
        if (tbItem === 'separator' || tbItem === '-') {
          $tb.append('<span class="cv-tb-sep"></span>'); continue;
        }
        if (tbItem instanceof HTMLElement || tbItem instanceof $) {
          $tb.append(tbItem); continue;
        }

        var isVisible = true;
        if (typeof tbItem.visible === 'function') {
          isVisible = tbItem.visible(currentItem, inst);
        } else if (tbItem.visible === false) {
          isVisible = false;
        }
        if (!isVisible) {
          continue;
        }

        var iconHtml = '';
        if (tbItem.icon) {
          if (tbItem.icon.charAt(0) === '<') {
            iconHtml = sanitizeIconHtml(tbItem.icon);
          } else {
            iconHtml = '<i class="cv-tb-icon ' + escHtml(tbItem.icon) + '"></i>';
          }
        }
        var label = tbItem.label || '';
        var tooltipText = (!isNullish(tbItem.tooltip) && tbItem.tooltip !== '') ? String(tbItem.tooltip) : label;
        var showTooltip = inst.opts.canShowTooltip !== false && tooltipText !== '';
        var ariaLabel = (tooltipText || (tbItem.id ? String(tbItem.id) : '')) && inst.opts.wcag ? ' aria-label="' + escHtml(tooltipText || tbItem.id || '') + '"' : '';
        var dataTooltip = showTooltip ? ' data-cv-tooltip="' + escHtml(tooltipText) + '"' : '';
        var btnHtml = iconHtml;
        if (tbItem.showLabel && label) {
          btnHtml += ' <span class="cv-tb-label">' + escHtml(label) + '</span>';
        }

        var shortcutAttr = '';
        if (!isNullish(tbItem.shortcutKey) && String(tbItem.shortcutKey).trim() !== '') {
          var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
          if (sk) {
            shortcutAttr = ' data-cv-shortcut="' + escHtml(sk) + '"';
          }
        }
        var $btn = $(
          '<button class="cv-tb-btn' +
            (tbItem.id ? ' cv-tb-' + escHtml(String(tbItem.id)) : '') +
            (tbItem.className ? ' ' + escHtml(String(tbItem.className)) : '') +
          '" type="button"' + shortcutAttr + dataTooltip + ariaLabel + '>' + btnHtml + '</button>'
        );
        if (typeof tbItem.onClick === 'function') {
          (function (fn, btn) {
            btn.on('click', function (e) {
              e.preventDefault(); fn(inst.items[inst.idx], inst);
            });
          }(tbItem.onClick, $btn));
        }
        $tb.append($btn);
      }
    }
  };

  /* --- IMAGE EXTRACT-TEXT OVERLAY --- */

  function buildExtractOverlay ($img, resp) {
    var data = (resp && resp.data) || {};
    var lines = data.lines;
    if (!lines || !lines.length) {
      return null;
    }
    var el = $img[0];
    if (!el) {
      return null;
    }
    var nw = el.naturalWidth;
    var nh = el.naturalHeight;
    var rw = $img.width();
    var rh = $img.height();
    if (!nw || !rw) {
      return null;
    }
    var rx = nw / rw;
    var ry = nh / rh;
    var HEIGHT_PAD = 5;
    var html = '';
    for (var i = 0, len = lines.length; i < len; i++) {
      var line = lines[i];
      for (var w = 0, wl = line.length; w < wl; w++) {
        var info = line[w];
        var box = info.box || [];
        var fb = [0, 0];
        var p0 = box[0] || fb;
        var p2 = box[2] || fb;
        var left = Math.round(p0[0] / rx);
        var top = Math.round((p0[1] - 2) / ry);
        var width = Math.round((p2[0] - p0[0]) / rx);
        var rawH = p2[1] - p0[1];
        var height = Math.round((rawH + HEIGHT_PAD) / ry);
        var fs = Math.floor((rawH - HEIGHT_PAD) / ry);
        var br = (w === wl - 1) ? '<br>' : '';
        html += '<span class="cv-extract-word" style="left:' + left + 'px;top:' + top + 'px;width:' + width + 'px;height:' + height + 'px;font-size:' + fs + 'px">' + escHtml(info.word || '') + ' ' + br + '</span>';
      }
    }
    if (!html) {
      return null;
    }
    return $('<div class="cv-extract-overlay"><div class="cv-extract-layer">' + html + '</div></div>');
  }

  function removeExtractOverlay ($stage) {
    $stage.find('.cv-extract-overlay').remove();
  }

  /* --- BUILT-IN: IMAGE --- */

  function builtInImageRenderer (item, $stage) {
    var inst = Overlay.activeInstance;
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      showError($stage, 'image', 'Invalid or unsafe image URL', item, { noDownload: true });
      return { imageError: true };
    }
    var $wrap = $('<div class="cv-img-wrap"></div>');
    Overlay.$loader.addClass('cv-active');
    var altText = (!isNullish(item.title) && String(item.title).trim() !== '') ? String(item.title) : '';
    var $img = $('<img class="cv-image" alt="' + escHtml(altText) + '" />');
    var imgEl = $img[0];
    function onImageReady () {
      Overlay.$loader.removeClass('cv-active');
      $img.addClass('cv-loaded');
      Overlay._clampPan();
      Overlay._applyTransform();
    }
    imgEl.onload = function () {
      if (Overlay.activeInstance !== inst) {
        return;
      }
      if (typeof imgEl.decode === 'function') {
        imgEl.decode().then(onImageReady).catch(function () {
          requestAnimationFrame(onImageReady);
        });
      } else {
        requestAnimationFrame(onImageReady);
      }
    };
    imgEl.onerror = function () {
      Overlay.$loader.removeClass('cv-active');
      $wrap.remove();
      $stage.empty();
      showError($stage, 'image', 'Image could not be loaded', item, { noDownload: !getItemDownloadUrl(item) });
      if (inst) {
        Overlay._resolveToolbar(inst, { imageError: true });
      }
    };
    $wrap.append($img);
    $stage.append($wrap);
    imgEl.src = srcUrl;
    return {};
  }

  /* --- BUILT-IN: VIDEO (jPlayer) --- */

  function builtInVideoNativeRenderer (item, $stage) {
    var inst = Overlay.activeInstance;
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var $wrap = $('<div class="cv-video-wrap"></div>');
    var posterUrl = getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
    var poster = (posterUrl && isSafeResourceUrl(posterUrl)) ? posterUrl : '';
    /* preload="none" so thumbnail (poster) is visible immediately; video loads on play */
    var $video = $('<video class="cv-native-video" controls playsinline preload="none"></video>');
    $video.attr('src', srcUrl);
    if (poster) {
      $video.attr('poster', poster);
    }
    $wrap.append($video);
    $stage.append($wrap);
    return {};
  }

  function builtInVideoRenderer (item, $stage, inst) {
    if (typeof $.fn.jPlayer === 'undefined') {
      return builtInVideoNativeRenderer(item, $stage);
    }
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var id = 'cv-jp-v-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = getMediaSupplied(item, inst);
    var media = {}; media[supplied] = srcUrl;
    var posterUrl = getResolvedUrl(item, inst, 'thumbnailUrl') || item.thumbnailUrl;
    if (posterUrl && isSafeResourceUrl(posterUrl)) {
      media.poster = posterUrl;
    }

    var vTip = (inst && inst.opts.canShowTooltip !== false);
    var v = function (k) {
      return vTip ? (' data-cv-tooltip="' + escHtml(str(inst, k)) + '"') : '';
    };
    var videoOpts = (inst && inst.opts.video) || {};
    var hdUrlFromItem = item.hdUrl && isSafeResourceUrl(item.hdUrl);
    var hasHdCallback = videoOpts.onGetHdUrl && typeof videoOpts.onGetHdUrl === 'function';
    var canShowHdFn = videoOpts.canShowHDButton && typeof videoOpts.canShowHDButton === 'function';
    var showHd = (hdUrlFromItem ? (!canShowHdFn || Boolean(videoOpts.canShowHDButton(item, inst))) : false) ||
      (Boolean(hasHdCallback) && !hdUrlFromItem);
    var hdBtnHtml = showHd ? ('<button class="cv-jp-btn cv-jp-hd" type="button"' + v('hd') + '>HD</button>') : '';
    var posterUrlForPoster = (posterUrl && isSafeResourceUrl(posterUrl)) ? posterUrl : '';
    var $wrap = $(
      '<div class="cv-video-wrap">' +
        '<div id="' + containerId + '" class="cv-jp-video-ui">' +
          (posterUrlForPoster ? '<div class="cv-jp-poster" aria-hidden="true"></div>' : '') +
          '<div class="cv-jp-video-screen"></div>' +
          (showHd ? '<span class="cv-jp-hd-badge" aria-hidden="true">HD</span>' : '') +
          '<div class="cv-jp-big-play"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><g transform="translate(12 12) scale(0.65) translate(-12 -12)"><polygon points="5 3 19 12 5 21" transform="translate(2.33 0)"/></g></svg></div>' +
          '<div class="cv-jp-controls">' +
            '<button class="cv-jp-btn jp-play" type="button"' + v('play') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button>' +
            '<button class="cv-jp-btn jp-pause" type="button"' + v('pause') + ' style="display:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>' +
            '<span class="cv-jp-time jp-current-time">0:00</span>' +
            '<div class="cv-jp-progress jp-seek-bar"><div class="cv-jp-play-bar jp-play-bar"></div></div>' +
            '<span class="cv-jp-time jp-duration">0:00</span>' +
            '<select class="cv-jp-speed"' + v('playbackSpeed') + '>' +
              '<option value="0.5">0.5x</option><option value="0.75">0.75x</option>' +
              '<option value="1" selected>1x</option><option value="1.25">1.25x</option>' +
              '<option value="1.5">1.5x</option><option value="2">2x</option>' +
            '</select>' +
            hdBtnHtml +
            '<button class="cv-jp-btn jp-mute" type="button"' + v('mute') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
            '<button class="cv-jp-btn jp-unmute" type="button"' + v('unmute') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
            '<div class="cv-jp-volume jp-volume-bar"><div class="cv-jp-volume-val jp-volume-bar-value"></div></div>' +
            '<button class="cv-jp-btn jp-full-screen" type="button"' + v('fullscreen') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
            '<button class="cv-jp-btn jp-restore-screen" type="button"' + v('exitFullscreen') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    if (posterUrlForPoster) {
      $wrap.find('.cv-jp-poster').css('background-image', 'url("' + posterUrlForPoster.replace(/"/g, '%22') + '")');
    }

    $stage.append($wrap);

    if (inst && inst.opts.wcag) {
      $wrap.find('.jp-play').attr('aria-label', str(inst, 'play'));
      $wrap.find('.jp-pause').attr('aria-label', str(inst, 'pause'));
      $wrap.find('.cv-jp-speed').attr('aria-label', str(inst, 'playbackSpeed'));
      $wrap.find('.cv-jp-hd').attr('aria-label', str(inst, 'hd'));
      $wrap.find('.jp-mute').attr('aria-label', str(inst, 'mute'));
      $wrap.find('.jp-unmute').attr('aria-label', str(inst, 'unmute'));
      $wrap.find('.jp-full-screen').attr('aria-label', str(inst, 'fullscreen'));
      $wrap.find('.jp-restore-screen').attr('aria-label', str(inst, 'exitFullscreen'));
    }

    var $jp = $();
    var $bigPlay = $wrap.find('.cv-jp-big-play');
    var $screen = $wrap.find('.cv-jp-video-screen');
    var $speed = $wrap.find('.cv-jp-speed');
    var isPlaying = false;
    var jpInited = false;
    var videoGateActive = false;
    var beforeVideoPlayFn = (typeof videoOpts.beforeVideoPlay === 'function') ? videoOpts.beforeVideoPlay : null;

    function doJPlayerInitAndPlay () {
      if (jpInited) {
        return;
      }
      jpInited = true;
      videoGateActive = false;
      $wrap.find('.cv-jp-poster').addClass('cv-hidden');
      if (!$jp.length) {
        var $playerDiv = $('<div id="' + id + '" class="cv-jp-player"></div>');
        $wrap.prepend($playerDiv);
        $jp = $playerDiv;
      }
      $jp.jPlayer({
        ready: function () {
          $(this).jPlayer('setMedia', media);
          $(this).jPlayer('play');
        },
        play: function () {
          isPlaying = true;
          syncPlayPauseUI(true);
        },
        pause: function () {
          isPlaying = false;
          syncPlayPauseUI(false);
        },
        ended: function () {
          isPlaying = false;
          syncPlayPauseUI(false);
        },
        volumechange: function (e) {
          var opts = e.jPlayer && e.jPlayer.options;
          var muted = (opts && opts.muted) || (opts && opts.volume === 0);
          syncMuteUI(Boolean(muted));
        },
        supplied: supplied,
        cssSelectorAncestor: '#' + containerId,
        size: { width: '100%', height: '100%', cssClass: 'cv-jp-video-size' },
        sizeFull: { width: '100%', height: '100%', cssClass: 'cv-jp-video-size-full' },
        smoothPlayBar: true,
        keyEnabled: false,
        globalVolume: true,
        playbackRate: 1
      });
    }

    function initJPlayerAndPlay () {
      if (jpInited) {
        return;
      }
      if (videoGateActive) {
        return;
      }
      if (beforeVideoPlayFn) {
        beforeVideoPlayFn(item, inst, function videoPlayNext (arg) {
          if (jpInited) {
            return;
          }
          if (arg && arg.gateContent && arg.gateContent.html) {
            videoGateActive = true;
            var gate = arg.gateContent;
            var $gate = $('<div class="cv-video-gate"></div>');
            var gh = gate.html;
            if (typeof gh === 'string') {
              $gate.html(gh);
            } else if (gh && gh.jquery) {
              $gate.append(gh);
            } else if (gh && gh.nodeType) {
              $gate.append(gh);
            } else {
              $gate.html(String(gh));
            }
            $wrap.append($gate);
            var $proceed = $gate.find('[data-cv-gate-proceed]');
            $proceed.off('click.cv-videoplay-gate').on('click.cv-videoplay-gate', function (e) {
              e.preventDefault();
              var ctx = (typeof gate.onProceed === 'function') ? gate.onProceed() : {};
              if (inst) {
                inst._videoBeforePlayContext = ctx || {};
              }
              $proceed.off('click.cv-videoplay-gate');
              $gate.remove();
              videoGateActive = false;
              if (!jpInited) {
                doJPlayerInitAndPlay();
              }
            });
            return;
          }
          doJPlayerInitAndPlay();
        }, $stage);
        return;
      }
      doJPlayerInitAndPlay();
    }

    function togglePlay () {
      if (isPlaying) {
        $jp.jPlayer('pause');
      } else if (!jpInited) {
        initJPlayerAndPlay();
      } else {
        $jp.jPlayer('play');
      }
    }

    $bigPlay.on('click', togglePlay);
    $screen.on('click', togglePlay);
    $wrap.find('.jp-play').on('click', togglePlay);
    $wrap.find('.jp-pause').on('click', togglePlay);

    $speed.on('change', function () {
      if (jpInited) {
      $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
      }
    });

    var $hdBtn = $wrap.find('.cv-jp-hd');
    var originalMedia = media;
    var isHdCurrentlyPlaying = false;
    if ($hdBtn.length) {
      var setHdButtonActive = function (active) {
        isHdCurrentlyPlaying = Boolean(active);
        $hdBtn.toggleClass('cv-jp-hd-active', isHdCurrentlyPlaying);
        var label = str(inst, 'hd') + (isHdCurrentlyPlaying ? ' (on)' : '');
        if (inst && inst.opts.canShowTooltip !== false) {
          $hdBtn.attr('data-cv-tooltip', label);
        }
        if (inst && inst.opts.wcag) {
          $hdBtn.attr('aria-label', label);
        }
        var $badge = $wrap.find('.cv-jp-hd-badge');
        if ($badge.length) {
          $badge.toggle(isHdCurrentlyPlaying);
        }
      };
      var doHdToggle = function () {
        if (!jpInited) {
          return;
        }
        var jpData = $jp.data('jPlayer');
        var currentTime = (jpData && jpData.status && typeof jpData.status.currentTime === 'number') ? jpData.status.currentTime : 0;
        var wasPlaying = isPlaying;
        $jp.jPlayer('pause');
        var didSeek = false;
        var seekFallbackTimer;
        var seekAndResume = function () {
          if (didSeek) {
            return;
          }
          didSeek = true;
          clearTimeout(seekFallbackTimer);
          $jp.jPlayer('pause', currentTime);
          if (wasPlaying) {
            $jp.jPlayer('play');
          }
        };
        if (isHdCurrentlyPlaying) {
          $jp.one('jPlayer_loadeddata', function () {
            seekAndResume();
            setHdButtonActive(false);
          });
          seekFallbackTimer = setTimeout(function () {
            seekAndResume();
            setHdButtonActive(false);
          }, 1200);
          $jp.jPlayer('setMedia', originalMedia);
          return;
        }
        var hdUrl = (hdUrlFromItem ? item.hdUrl : null) || (hasHdCallback ? videoOpts.onGetHdUrl(item, inst) : null);
        if (!hdUrl || !isSafeResourceUrl(hdUrl)) {
          return;
        }
        var newMedia = {}; newMedia[supplied] = hdUrl;
        if (originalMedia.poster) {
          newMedia.poster = originalMedia.poster;
        }
        $jp.one('jPlayer_loadeddata', function () {
          seekAndResume();
          setHdButtonActive(true);
        });
        seekFallbackTimer = setTimeout(function () {
          seekAndResume();
          setHdButtonActive(true);
        }, 1200);
        $jp.jPlayer('setMedia', newMedia);
      };
      $hdBtn.on('click', function () {
        if (!jpInited) {
          return;
        }
        if (isHdCurrentlyPlaying) {
          doHdToggle();
          return;
        }
        var hdUrl = (hdUrlFromItem ? item.hdUrl : null) || (hasHdCallback ? videoOpts.onGetHdUrl(item, inst) : null);
        if (!hdUrl || !isSafeResourceUrl(hdUrl)) {
          return;
        }
        doHdToggle();
      });
    }

    var $fullscreenBtn = $wrap.find('.jp-full-screen');
    var $restoreBtn = $wrap.find('.jp-restore-screen');
    var wrapEl = $wrap[0];

    function onFullscreenChange () {
      var fsEl = getFullscreenElement();
      var isVideoFullscreen = (fsEl === wrapEl);
      $fullscreenBtn.toggle(!isVideoFullscreen);
      $restoreBtn.toggle(isVideoFullscreen);
      if (inst && inst.opts.canShowTooltip !== false) {
        $fullscreenBtn.attr('data-cv-tooltip', str(inst, 'fullscreen'));
        $restoreBtn.attr('data-cv-tooltip', str(inst, 'exitFullscreen'));
      }
      if (inst && inst.opts.wcag) {
        $fullscreenBtn.attr('aria-label', str(inst, 'fullscreen'));
        $restoreBtn.attr('aria-label', str(inst, 'exitFullscreen'));
      }
      /* Move tooltip into video wrapper when video is fullscreen so it appears above video layer */
      if (Overlay.$tooltip && Overlay.$tooltip.length) {
        if (isVideoFullscreen) {
          if (Overlay.$tooltip.parent()[0] !== wrapEl) {
            $wrap.append(Overlay.$tooltip);
          }
        } else {
          var overlayEl = Overlay.$el && Overlay.$el[0];
          if (fsEl === overlayEl) {
            if (Overlay.$tooltip.parent()[0] !== overlayEl) {
              Overlay.$el.append(Overlay.$tooltip);
            }
          } else if (Overlay.$tooltip.parent()[0] !== document.body) {
            $('body').append(Overlay.$tooltip);
          }
        }
      }
    }

    $fullscreenBtn.on('click', function () {
      if (wrapEl.requestFullscreen) {
        wrapEl.requestFullscreen();
      } else if (wrapEl.webkitRequestFullscreen) {
        wrapEl.webkitRequestFullscreen();
      } else if (wrapEl.mozRequestFullScreen) {
        wrapEl.mozRequestFullScreen();
      } else if (wrapEl.msRequestFullscreen) {
        wrapEl.msRequestFullscreen();
      }
    });
    $restoreBtn.on('click', function () {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    });

    $(document).on('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video', function () {
      onFullscreenChange();
    });
    onFullscreenChange();

    function syncPlayPauseUI (playing) {
      $bigPlay.toggleClass('cv-hidden', Boolean(playing));
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(Boolean(playing));
    }
    function syncMuteUI (muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(Boolean(muted));
    }

    return {
      destroy: function () {
        $(document).off('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video');
        $wrap.find('.cv-video-gate').remove();
        videoGateActive = false;
        if (jpInited && $jp.length) {
        $jp.jPlayer('destroy');
          $jp.remove();
        }
      }
    };
  }

  /* --- BUILT-IN: AUDIO (jPlayer) --- */

  function builtInAudioNativeRenderer (item, $stage) {
    var inst = Overlay.activeInstance;
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var ext = (item.fileExt || item.title || '').split('.').pop().toUpperCase() || 'AUDIO';
    var $wrap = $(
      '<div class="cv-audio-wrap">' +
        '<div class="cv-audio-artwork">' +
          '<div class="cv-audio-icon"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="cv-audio-title">' + escHtml(item.title || 'Audio') + '</div>' +
          '<div class="cv-audio-meta"><span>' + escHtml(ext) + '</span></div>' +
        '</div>' +
        '<div class="cv-audio-native-controls"></div>' +
      '</div>'
    );
    var $audio = $('<audio controls preload="metadata"></audio>');
    $audio.attr('src', srcUrl);
    $wrap.find('.cv-audio-native-controls').append($audio);
    $stage.append($wrap);
    return {};
  }

  function builtInAudioRenderer (item, $stage, inst) {
    if (typeof $.fn.jPlayer === 'undefined') {
      return builtInAudioNativeRenderer(item, $stage);
    }
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var id = 'cv-jp-a-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = getMediaSupplied(item, inst);
    var media = {}; media[supplied] = srcUrl;
    var ext = (item.fileExt || item.title || '').split('.').pop().toUpperCase() || 'AUDIO';

    var aTip = (inst && inst.opts.canShowTooltip !== false);
    var a = function (k) {
      return aTip ? (' data-cv-tooltip="' + escHtml(str(inst, k)) + '"') : '';
    };
    var $wrap = $(
      '<div class="cv-audio-wrap">' +
        '<div class="cv-audio-artwork">' +
          '<div class="cv-audio-icon"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="cv-audio-title">' + escHtml(item.title || 'Audio') + '</div>' +
          '<div class="cv-audio-meta">' +
            (item.fileSize ? '<span>' + escHtml(item.fileSize) + '</span>' : '') +
            '<span>' + escHtml(ext) + '</span>' +
          '</div>' +
        '</div>' +
        '<div id="' + containerId + '" class="cv-jp-audio-ui">' +
          '<div class="cv-jp-controls">' +
            '<button class="cv-jp-btn cv-jp-btn-lg jp-play" type="button"' + a('play') + '><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button>' +
            '<button class="cv-jp-btn cv-jp-btn-lg jp-pause" type="button"' + a('pause') + ' style="display:none"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>' +
            '<span class="cv-jp-time jp-current-time">0:00</span>' +
            '<div class="cv-jp-progress jp-seek-bar"><div class="cv-jp-play-bar jp-play-bar"></div></div>' +
            '<span class="cv-jp-time jp-duration">0:00</span>' +
            '<select class="cv-jp-speed"' + a('playbackSpeed') + '>' +
              '<option value="0.5">0.5x</option><option value="0.75">0.75x</option>' +
              '<option value="1" selected>1x</option><option value="1.25">1.25x</option>' +
              '<option value="1.5">1.5x</option><option value="2">2x</option>' +
            '</select>' +
            '<button class="cv-jp-btn jp-mute" type="button"' + a('mute') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
            '<button class="cv-jp-btn jp-unmute" type="button"' + a('unmute') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
            '<div class="cv-jp-volume jp-volume-bar"><div class="cv-jp-volume-val jp-volume-bar-value"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    $stage.append($wrap);

    if (inst && inst.opts.wcag) {
      $wrap.find('.jp-play').attr('aria-label', str(inst, 'play'));
      $wrap.find('.jp-pause').attr('aria-label', str(inst, 'pause'));
      $wrap.find('.cv-jp-speed').attr('aria-label', str(inst, 'playbackSpeed'));
      $wrap.find('.jp-mute').attr('aria-label', str(inst, 'mute'));
      $wrap.find('.jp-unmute').attr('aria-label', str(inst, 'unmute'));
    }

    var $jp = $();
    var $speed = $wrap.find('.cv-jp-speed');
    var jpInited = false;

    function syncAudioPlayPauseUI (playing) {
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(Boolean(playing));
    }
    function syncAudioMuteUI (muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(Boolean(muted));
    }

    function initJPlayerAndPlay () {
      if (jpInited) {
        return;
      }
      jpInited = true;
      if (!$jp.length) {
        var $playerDiv = $('<div id="' + id + '" class="cv-jp-player"></div>');
        $wrap.prepend($playerDiv);
        $jp = $playerDiv;
      }
    $jp.jPlayer({
        ready: function () {
          $(this).jPlayer('setMedia', media);
          $(this).jPlayer('play');
        },
        play: function () {
          syncAudioPlayPauseUI(true);
        },
        pause: function () {
          syncAudioPlayPauseUI(false);
        },
        ended: function () {
          syncAudioPlayPauseUI(false);
        },
        volumechange: function (e) {
          var opts = e.jPlayer && e.jPlayer.options;
          var muted = (opts && opts.muted) || (opts && opts.volume === 0);
          syncAudioMuteUI(Boolean(muted));
        },
      supplied: supplied,
      cssSelectorAncestor: '#' + containerId,
      smoothPlayBar: true,
      keyEnabled: false,
      globalVolume: true,
      playbackRate: 1
      });
    }

    function toggleAudioPlay () {
      if (!jpInited) {
        initJPlayerAndPlay();
        return;
      }
      var jpData = $jp.data('jPlayer');
      var status = (jpData && jpData.status) ? jpData.status : {};
      var paused = (status.paused !== undefined) ? status.paused : true;
      if (paused) {
        $jp.jPlayer('play');
      } else {
        $jp.jPlayer('pause');
      }
    }

    $wrap.find('.jp-play').on('click', toggleAudioPlay);
    $wrap.find('.jp-pause').on('click', toggleAudioPlay);

    $speed.on('change', function () {
      if (jpInited) {
        $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
      }
    });

    return {
      destroy: function () {
        if (jpInited && $jp.length) {
          $jp.jPlayer('destroy');
          $jp.remove();
        }
      }
    };
  }

  /* --- BUILT-IN: PDF (pdf.js) --- */

  function builtInPdfIframeRenderer (item, $stage) {
    var inst = Overlay.activeInstance;
    var srcUrl = getResolvedSrcUrl(item, inst);
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }
    var $wrap = $('<div class="cv-pdf-iframe-wrap"></div>');
    var $iframe = $('<iframe class="cv-pdf-iframe" title="PDF"></iframe>');
    $iframe.attr('src', srcUrl);
    $wrap.append($iframe);
    $stage.append($wrap);
    return {};
  }

  function builtInPdfRenderer (item, $stage, inst) {
    if (typeof window.pdfjsLib === 'undefined') {
      return builtInPdfIframeRenderer(item, $stage);
    }
    var srcUrl = getResolvedSrcUrl(item, inst) || item.src;
    if (!srcUrl || !isSafeResourceUrl(srcUrl)) {
      return null;
    }

    var pdfOpts = inst.opts.pdf || {};
    var showAnnotations = pdfOpts.annotations !== false;
    var useAutoFit = pdfOpts.autoFit !== false;
    var minScale = (typeof pdfOpts.autoFitMinScale === 'number' ? pdfOpts.autoFitMinScale : 0.75);
    var maxScale = (typeof pdfOpts.autoFitMaxScale === 'number' ? pdfOpts.autoFitMaxScale : 2.5);
    var enableTextLayer = pdfOpts.textLayer !== false;
    var onPrint = typeof pdfOpts.onPrint === 'function' ? pdfOpts.onPrint : null;
    var twoPageView = false; // always start single-page; toggle shown only when pdfOpts.twoPageView is true
    var TWO_PAGE_GAP = 12;

    var $container = $(
      '<div class="cv-pdf-wrap">' +
        '<div class="cv-pdf-sidebar" style="display:none"><div class="cv-pdf-thumbs"></div></div>' +
        '<div class="cv-pdf-main"><div class="cv-pdf-main-inner"><div class="cv-pdf-canvas-wrap"></div></div></div>' +
      '</div>'
    );

    var $sidebar = $container.find('.cv-pdf-sidebar');
    var $thumbs = $container.find('.cv-pdf-thumbs');
    var $main = $container.find('.cv-pdf-main');
    var $canvasWrap = $container.find('.cv-pdf-canvas-wrap');

    var pdfDoc = null,
      pageNum = 1,
      totalPages = 0;
    var pdfScale = 1.0,
      rotation = 0;
    var rendering = false;
    var pdfResizeTid = null;
    var scrollTid = null;
    var zoomRenderTid = null;
    var pendingZoomRender = false;
    var textLayerVisible = false;
    var $zoomSelect = null;
    var zoomPresetsPct = [50, 75, 100, 125, 150, 175, 200, 225, 250];
    var $pageInfo = null;
    var pageEditing = false;
    var $tbExtract = null;

    function clampPdfScale (s) {
      return Math.max(0.25, Math.min(5, s));
    }
    function nearestPresetPct (scale) {
      var pct = Math.round(scale * 100);
      var best = zoomPresetsPct[0],
        bestD = Math.abs(pct - best);
      for (var i = 1; i < zoomPresetsPct.length; i++) {
        var d = Math.abs(pct - zoomPresetsPct[i]);
        if (d < bestD) {
          bestD = d; best = zoomPresetsPct[i];
        }
      }
      return best;
    }
    function syncZoomSelect () {
      if (!$zoomSelect || !$zoomSelect.length) {
        return;
      }
      if (useAutoFit) {
        $zoomSelect.val('autofit'); return;
      }
      $zoomSelect.val(String(nearestPresetPct(pdfScale)));
    }
    function onZoomRenderDone () {
      zoomRenderTid = null;
      if (pendingZoomRender) {
        pendingZoomRender = false;
        renderAllPages(function () {
          syncZoomSelect(); onZoomRenderDone();
        });
      }
    }
    function scheduleZoomRender () {
      clearTimeout(zoomRenderTid);
      zoomRenderTid = setTimeout(function () {
        if (rendering) {
          pendingZoomRender = true;
          return;
        }
        renderAllPages(function () {
          syncZoomSelect(); onZoomRenderDone();
        });
      }, 100);
    }
    function setPdfScaleManual (nextScale) {
      useAutoFit = false;
      pdfScale = clampPdfScale(nextScale);
      syncZoomSelect();
      scheduleZoomRender();
    }

    function applyAutoFitScale () {
      if (!useAutoFit || !pdfDoc) {
        return;
      }
      var size = getStageSize();
      pdfDoc.getPage(1).then(function (page) {
        var vp1 = page.getViewport({ scale: 1, rotation: rotation });
        if (size.w > 0 && size.h > 0) {
          var fitScale;
          if (twoPageView) {
            fitScale = Math.min((size.w - TWO_PAGE_GAP) / (2 * vp1.width), size.h / vp1.height);
          } else {
            fitScale = Math.min(size.w / vp1.width, size.h / vp1.height);
          }
          pdfScale = Math.max(minScale, Math.min(fitScale, maxScale));
        }
        renderAllPages();
        syncZoomSelect();
      });
    }

    function updateCurrentPageFromScroll () {
      if (!pdfDoc || totalPages < 1) {
        return;
      }
      var main = $main[0];
      if (!main) {
        return;
      }
      var mainRect = main.getBoundingClientRect();
      var pages = $canvasWrap.find('.cv-pdf-page');
      var best = 1;
      var bestVisible = 0;
      for (var i = 0; i < pages.length; i++) {
        var el = pages[i];
        var num = parseInt(el.getAttribute('data-page'));
        if (!num) {
          continue;
        }
        var rect = el.getBoundingClientRect();
        var overlapTop = Math.max(mainRect.top, rect.top);
        var overlapBottom = Math.min(mainRect.bottom, rect.bottom);
        var visible = Math.max(0, overlapBottom - overlapTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = num;
        }
      }
      if (pageNum !== best) {
        pageNum = best;
        updatePageInfoDisplay();
        $thumbs.find('.cv-pdf-thumb').removeClass('cv-active');
        $thumbs.find('[data-page="' + pageNum + '"]').addClass('cv-active');
      }
    }

    function renderPageToContainer ($parent, num, done) {
      pdfDoc.getPage(num).then(function (page) {
        var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
        var $pageWrap = $('<div class="cv-pdf-page"></div>');
        $pageWrap.attr('data-page', num);
        $pageWrap.css({ position: 'relative', width: vp.width + 'px', height: vp.height + 'px' });

        var canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.className = 'cv-pdf-canvas';
        $pageWrap.append(canvas);
        $parent.append($pageWrap);

        var renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        var renderPromise = renderTask.promise || renderTask;
        renderPromise.then(function () {
          if (showAnnotations) {
            renderAnnotations(page, vp, $pageWrap);
          }
          if (enableTextLayer && textLayerVisible && typeof page.getTextContent === 'function') {
            page.getTextContent().then(function (tc) {
              renderTextLayerForPage(tc, vp, $pageWrap);
            });
          }
          if (done) {
            done();
          }
        });
      });
    }

    function renderOnePage (num, done) {
      renderPageToContainer($canvasWrap, num, done);
    }

    function renderSpread (leftNum, rightNum, done) {
      var $spread = $('<div class="cv-pdf-spread"></div>');
      $canvasWrap.append($spread);
      var pending = rightNum ? 2 : 1;
      function onOne () {
        pending--;
        if (pending === 0 && done) {
          done();
        }
      }
      renderPageToContainer($spread, leftNum, onOne);
      if (rightNum) {
        renderPageToContainer($spread, rightNum, onOne);
      }
    }

    function renderAllPages (done) {
      if (rendering || !pdfDoc) {
        return;
      }
      rendering = true;
      $canvasWrap.empty();
      if (twoPageView) {
        var spreadIndex = 0;
        var numSpreads = Math.ceil(totalPages / 2);
        var nextSpread = function () {
          spreadIndex++;
          if (spreadIndex > numSpreads) {
            rendering = false;
            updatePageInfoDisplay();
            $main.off('scroll.cv-pdf-page').on('scroll.cv-pdf-page', function () {
              clearTimeout(scrollTid);
              scrollTid = setTimeout(updateCurrentPageFromScroll, 80);
            });
            updateCurrentPageFromScroll();
            if (done) {
              done();
            }
            return;
          }
          var left = (spreadIndex - 1) * 2 + 1;
          var right = (left + 1 <= totalPages) ? left + 1 : null;
          renderSpread(left, right, nextSpread);
        };
        nextSpread();
      } else {
      var idx = 0;
        var next = function () {
        idx++;
        if (idx > totalPages) {
          rendering = false;
            updatePageInfoDisplay();
            $main.off('scroll.cv-pdf-page').on('scroll.cv-pdf-page', function () {
            clearTimeout(scrollTid);
            scrollTid = setTimeout(updateCurrentPageFromScroll, 80);
          });
          updateCurrentPageFromScroll();
            if (done) {
              done();
            }
          return;
        }
        renderOnePage(idx, next);
        };
      next();
      }
    }

    function normalizeRectFallback (r) {
      if (!r || r.length < 4) {
        return [0, 0, 0, 0];
      }
      var x1 = r[0],
        y1 = r[1],
        x2 = r[2],
        y2 = r[3];
      return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    }

    function multiplyTransform (m1, m2) {
      if (!m1 || m1.length < 6 || !m2 || m2.length < 6) {
        return m2 || m1;
      }
      return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ];
    }

    function renderTextLayerForPage (textContent, viewport, $pageWrap) {
      if (!textContent || !textContent.items || !viewport) {
        return;
      }
      var Util = (typeof pdfjsLib !== 'undefined' && pdfjsLib.Util && typeof pdfjsLib.Util.transform === 'function') ? pdfjsLib.Util : null;
      var vpTransform = viewport.transform;
      if (!vpTransform || vpTransform.length < 6) {
        vpTransform = [1, 0, 0, 1, 0, 0];
      }
      var $layer = $('<div class="cv-pdf-text-layer"></div>');
      $layer.css({ position: 'absolute', left: 0, top: 0, width: viewport.width + 'px', height: viewport.height + 'px', overflow: 'hidden', pointerEvents: 'auto', userSelect: 'text', WebkitUserSelect: 'text' });
      var items = textContent.items;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var str = (item && item.str !== null && item.str !== undefined) ? String(item.str) : '';
        var t = (item && item.transform !== null && item.transform !== undefined && item.transform.length >= 6) ?
          item.transform : [1, 0, 0, 1, 0, 0];
        var tx = Util ? Util.transform(vpTransform, t) : multiplyTransform(vpTransform, t);
        var left = tx[4];
        var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || 12;
        var top = tx[5] - fontHeight;
        var span = document.createElement('span');
        span.className = 'cv-pdf-text-span';
        span.style.cssText = 'position:absolute;left:' + left + 'px;top:' + top + 'px;font-size:' + fontHeight + 'px;line-height:1.15;white-space:pre;pointer-events:auto;';
        span.textContent = str;
        $layer[0].appendChild(span);
      }
      var $ann = $pageWrap.find('.cv-pdf-annotations');
      if ($ann.length) {
        $ann.before($layer);
      } else {
        $pageWrap.append($layer);
      }
    }

    function renderTextLayerForAllPages () {
      if (!pdfDoc || typeof pdfDoc.getPage !== 'function') {
        return;
      }
      $canvasWrap.find('.cv-pdf-page').each(function () {
        var $pw = $(this);
        var num = parseInt($pw.attr('data-page'));
        if (!num) {
          return;
        }
        pdfDoc.getPage(num).then(function (page) {
          var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
          if (typeof page.getTextContent !== 'function') {
            return;
          }
          page.getTextContent().then(function (tc) {
            renderTextLayerForPage(tc, vp, $pw);
          });
        });
      });
    }

    function renderAnnotations (page, viewport, $pageWrap) {
      page.getAnnotations().then(function (annotations) {
        if (!annotations || !annotations.length) {
          return;
        }
        var convertToViewport = viewport.convertToViewportRectangle || viewport.convertToViewport;
        if (!convertToViewport) {
          return;
        }
        var normalizeRect = (typeof pdfjsLib.Util !== 'undefined' && typeof pdfjsLib.Util.normalizeRect === 'function') ?
          pdfjsLib.Util.normalizeRect :
          normalizeRectFallback;

        var $layer = $('<div class="cv-pdf-annotations"></div>');
        $layer.css({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' });

        for (var i = 0; i < annotations.length; i++) {
          var ann = annotations[i];
          if (!ann.rect) {
            continue;
          }

          var rawRect = convertToViewport.call(viewport, ann.rect);
          var rect = normalizeRect(rawRect);

          var $el = $('<div class="cv-pdf-annot"></div>');
          $el.css({
            position: 'absolute',
            left: rect[0] + 'px',
            top: rect[1] + 'px',
            width: (rect[2] - rect[0]) + 'px',
            height: (rect[3] - rect[1]) + 'px'
          });

          if (ann.subtype === 'Link' && ann.url && isSafeResourceUrl(ann.url)) {
            var $link = $('<a class="cv-pdf-annot-link"></a>');
            $link.attr({ href: ann.url, target: '_blank' });
            $link.css({ display: 'block', width: '100%', height: '100%' });
            $el.append($link);
          } else if (ann.subtype === 'Link' && ann.dest) {
            (function (dest, el, doc) {
              el.css('cursor', 'pointer');
              el.on('click', function () {
                if (typeof dest === 'number') {
                  goToPage(dest + 1);
                } else if (Array.isArray(dest)) {
                  doc.getPageIndex(dest[0]).then(function (idx) {
                    goToPage(idx + 1);
                  });
                }
              });
            }(ann.dest, $el, pdfDoc));
          }

          if (ann.subtype === 'Highlight') {
            $el.addClass('cv-pdf-annot-highlight');
          }

          $layer.append($el);
        }

        $pageWrap.append($layer);
      });
    }

    function buildThumbnail (num) {
      pdfDoc.getPage(num).then(function (page) {
        var vp = page.getViewport({ scale: 0.25 });
        var c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        var $t = $('<div class="cv-pdf-thumb' + (num === 1 ? ' cv-active' : '') + '" data-page="' + num + '"></div>');
        $t.append(c).append('<span class="cv-pdf-thumb-num">' + num + '</span>');
        $t.on('click', function () {
          goToPage(num);
        });
        $thumbs.append($t);
        page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      });
    }

    function updatePageInfoDisplay () {
      if (!$pageInfo || pageEditing) {
        return;
      }
      var $cur = $pageInfo.find('.cv-pdf-page-current');
      var $tot = $pageInfo.find('.cv-pdf-page-total');
      if ($cur.length) {
        $cur.text(pageNum);
      }
      if ($tot.length) {
        $tot.text(totalPages || '-');
      }
    }
    function goToPage (num) {
      if (totalPages < 1) {
        return;
      }
      num = Math.max(1, Math.min(totalPages, num));
      pageNum = num;
      updatePageInfoDisplay();
      $thumbs.find('.cv-pdf-thumb').removeClass('cv-active');
      $thumbs.find('[data-page="' + pageNum + '"]').addClass('cv-active');
      var $pageEl = $canvasWrap.find('.cv-pdf-page[data-page="' + num + '"]');
      if ($pageEl.length) {
        $pageEl[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    Overlay.$loader.addClass('cv-active');
    if (pdfOpts.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfOpts.workerSrc;
    }

    var docParams = { url: srcUrl, withCredentials: true };
    if (pdfOpts.cMapUrl) {
      docParams.cMapUrl = pdfOpts.cMapUrl;
      docParams.cMapPacked = pdfOpts.cMapPacked !== false;
    }

    function getStageSize () {
      var $wrap = Overlay.$stageWrap;
      return {
        w: ($wrap && $wrap.length ? $wrap.width() : 0) || $stage.width() || 600,
        h: ($wrap && $wrap.length ? $wrap.height() : 0) || $stage.height() || 800
      };
    }

    var loadingTask = (typeof docParams === 'object' && docParams.url) ? pdfjsLib.getDocument(docParams) : pdfjsLib.getDocument(srcUrl);
    var loadPromise = loadingTask.promise || loadingTask;
    loadPromise.then(function (pdf) {
      pdfDoc = pdf; totalPages = pdf.numPages;
      Overlay.$loader.removeClass('cv-active');

      function checkPdfHasText (cb) {
        var pagesToCheck = Math.min(3, Math.max(1, totalPages));
        var idx = 0;
        function next () {
          if (idx >= pagesToCheck) {
            cb(false); return;
          }
          pdf.getPage(idx + 1).then(function (page) {
            if (typeof page.getTextContent !== 'function') {
              idx++; next(); return;
            }
            var p = page.getTextContent();
            (p && p.then ? p : Promise.resolve(p)).then(function (tc) {
              if (tc && tc.items && tc.items.length > 0) {
                cb(true); return;
              }
              idx++;
              next();
            }).catch(function () {
              idx++; next();
            });
          }).catch(function () {
            idx++; next();
          });
        }
        next();
      }
      if (enableTextLayer && totalPages > 0) {
        checkPdfHasText(function (hasText) {
          if (hasText && $tbExtract && Overlay.$toolbar && Overlay.$toolbar.length) {
            var $print = Overlay.$toolbar.find('.cv-tb-pdf-print');
            if ($print.length) {
              $print.after($tbExtract);
            } else {
              Overlay.$toolbar.append($tbExtract);
            }
          }
        });
      }

      function runInitialScaleAndRender () {
        var size = getStageSize();
        var wrapW = size.w;
        var wrapH = size.h;

        pdf.getPage(1).then(function (fp) {
          var vp = fp.getViewport({ scale: 1 });
          if (useAutoFit && wrapW > 0 && wrapH > 0) {
            var fitScale = twoPageView ?
              Math.min((wrapW - TWO_PAGE_GAP) / (2 * vp.width), wrapH / vp.height) :
              Math.min(wrapW / vp.width, wrapH / vp.height);
            pdfScale = Math.max(minScale, Math.min(fitScale, maxScale));
          } else if (!useAutoFit && wrapW > 0) {
            pdfScale = Math.max(0.25, Math.min(twoPageView ? (wrapW - TWO_PAGE_GAP) / (2 * vp.width) : wrapW / vp.width, maxScale));
          } else {
            pdfScale = Math.min(1, maxScale);
          }
          syncZoomSelect();
          renderAllPages(function () {
            for (var i = 1; i <= totalPages; i++) {
              buildThumbnail(i);
            }
          });
          if (useAutoFit) {
            $(window).on('resize.cv-pdf-autofit', function () {
              clearTimeout(pdfResizeTid);
              pdfResizeTid = setTimeout(applyAutoFitScale, 150);
            });
          }
        });
      }

      /* Defer so layout is complete after container is in DOM (autoFit needs correct stage size) */
      requestAnimationFrame(function () {
        requestAnimationFrame(runInitialScaleAndRender);
      });
    }, function () {
      Overlay.$loader.removeClass('cv-active');
      showError($stage, 'pdf', 'PDF could not be loaded', item);
    });

    $stage.append($container);

    /* toolbar items */
    var tipAttr = (inst && inst.opts.canShowTooltip !== false) ? function (k) {
      return ' data-cv-tooltip="' + escHtml(str(inst, k)) + '"';
    } : function () {
      return '';
    };
    var ariaAttr = (inst && inst.opts.wcag) ? function (k) {
      return ' aria-label="' + escHtml(str(inst, k)) + '"';
    } : function () {
      return '';
    };
    var toolbarItems = [];
    var $tbThumb = $('<button class="cv-tb-btn"' + tipAttr('thumbnails') + ariaAttr('thumbnails') + '>' + Icons.thumbnails + '</button>');
    $tbThumb.on('click', function () {
      $sidebar.toggle(); $tbThumb.toggleClass('cv-active');
    });
    toolbarItems.push($tbThumb[0]);

    var $tbPrev = $('<button class="cv-tb-btn"' + tipAttr('previousPage') + ariaAttr('previousPage') + '>' + Icons.prevPage + '</button>');
    $tbPrev.on('click', function () {
      goToPage(pageNum - 1);
    });
    toolbarItems.push($tbPrev[0]);

    $pageInfo = $('<span class="cv-pdf-page-info"><span class="cv-pdf-page-current">1</span> / <span class="cv-pdf-page-total">-</span></span>');
    $pageInfo.on('click', function () {
      if (pageEditing) {
        return;
      }
      pageEditing = true;
      var cur = String(pageNum || 1);
      var $input = $('<input class="cv-pdf-page-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />');
      $input.val(cur);
      $pageInfo.find('.cv-pdf-page-current').replaceWith($input);
      $input[0].focus();

      function restoreDisplay () {
        var $cur = $('<span class="cv-pdf-page-current"></span>').text(pageNum);
        $input.replaceWith($cur);
        $pageInfo.find('.cv-pdf-page-total').text(totalPages || '-');
        pageEditing = false;
      }
      function commit () {
        var raw = String($input.val() || '').trim();
        var n = parseInt(raw);
        if (isNaN(n)) {
          restoreDisplay(); return;
        }
        n = Math.max(1, Math.min(totalPages || 1, n));
        restoreDisplay();
        if (totalPages) {
          goToPage(n);
        }
      }

      $input.on('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault(); commit();
        } else if (e.key === 'Escape') {
          e.preventDefault(); restoreDisplay();
        }
      });
      $input.on('blur', function () {
        commit();
      });
    });
    toolbarItems.push($pageInfo[0]);

    var $tbNext = $('<button class="cv-tb-btn"' + tipAttr('nextPage') + ariaAttr('nextPage') + '>' + Icons.nextPage + '</button>');
    $tbNext.on('click', function () {
      goToPage(pageNum + 1);
    });
    toolbarItems.push($tbNext[0]);

    toolbarItems.push('separator');

    var $tbZoomOut = $('<button class="cv-tb-btn cv-tb-pdf-zoom-out"' + tipAttr('zoomOut') + ariaAttr('zoomOut') + '>' + Icons.zoomOut + '</button>');
    $tbZoomOut.on('click', function () {
      setPdfScaleManual(pdfScale - 0.25);
    });
    toolbarItems.push($tbZoomOut[0]);

    $zoomSelect = $('<select class="cv-pdf-zoom-select"' + ariaAttr('zoom') + '></select>');
    $zoomSelect.append('<option value="autofit">Auto Fit</option>');
    for (var zi = 0; zi < zoomPresetsPct.length; zi++) {
      var zp = zoomPresetsPct[zi];
      $zoomSelect.append('<option value="' + zp + '">' + zp + '%</option>');
    }
    $zoomSelect.on('change', function () {
      var v = String($(this).val() || '');
      if (v === 'autofit') {
        useAutoFit = true;
        applyAutoFitScale();
        syncZoomSelect();
        return;
      }
      var pct = parseInt(v);
      if (!isNaN(pct) && pct > 0) {
        setPdfScaleManual(pct / 100);
      }
    });
    syncZoomSelect();
    toolbarItems.push($zoomSelect[0]);

    var $tbZoomIn = $('<button class="cv-tb-btn cv-tb-pdf-zoom-in"' + tipAttr('zoomIn') + ariaAttr('zoomIn') + '>' + Icons.zoomIn + '</button>');
    $tbZoomIn.on('click', function () {
      setPdfScaleManual(pdfScale + 0.25);
    });
    toolbarItems.push($tbZoomIn[0]);

    var $tbRotate = $('<button class="cv-tb-btn"' + tipAttr('rotate') + ariaAttr('rotate') + '>' + Icons.rotateCw + '</button>');
    $tbRotate.on('click', function () {
      rotation = (rotation + 90) % 360; renderAllPages();
    });
    toolbarItems.push($tbRotate[0]);

    if (pdfOpts.twoPageView === true) {
      var $tbTwoPage = $('<button class="cv-tb-btn cv-tb-pdf-twopage"' + tipAttr('twoPageView') + ariaAttr('twoPageView') + '>' + Icons.twoPageView + '</button>');
      var updateTwoPageToggleState = function () {
        $tbTwoPage.toggleClass('cv-active', twoPageView);
        var tip = twoPageView ? str(inst, 'singlePageView') : str(inst, 'twoPageView');
        $tbTwoPage.attr('data-cv-tooltip', tip);
        if (inst.opts.wcag) {
          $tbTwoPage.attr('aria-label', tip);
        }
      };
      $tbTwoPage.on('click', function () {
        twoPageView = !twoPageView;
        updateTwoPageToggleState();
        useAutoFit = true;
        applyAutoFitScale();
      });
      updateTwoPageToggleState();
      toolbarItems.push($tbTwoPage[0]);
    }

    function defaultPrint () {
      var $page = $canvasWrap.find('.cv-pdf-page[data-page="' + pageNum + '"]');
      var canvas = $page.length ? $page.find('canvas')[0] : $canvasWrap.find('canvas')[0];
      if (!canvas) {
        return;
      }
      var win = window.open('');
      var dataUrl = canvas.toDataURL().replace(/"/g, '&quot;');
      win.document.write('<img src="' + dataUrl + '" onload="window.print();window.close();" />');
    }
    var $tbPrint = $('<button class="cv-tb-btn cv-tb-pdf-print"' + tipAttr('print') + ariaAttr('print') + '>' + Icons.print + '</button>');
    $tbPrint.on('click', function () {
      if (onPrint) {
        onPrint({ item: item, pdfDoc: pdfDoc, pageNum: pageNum, totalPages: totalPages, $canvasWrap: $canvasWrap, defaultPrint: defaultPrint });
        return;
      }
      defaultPrint();
    });
    toolbarItems.push($tbPrint[0]);

    if (enableTextLayer && pdfOpts.extractText === true) {
      $tbExtract = $('<button class="cv-tb-btn cv-tb-pdf-extract"' + tipAttr('extractText') + ariaAttr('extractText') + '>' + Icons.extractText + '</button>');
      $tbExtract.on('click', function () {
        textLayerVisible = !textLayerVisible;
        if (textLayerVisible) {
          renderTextLayerForAllPages();
        } else {
          $canvasWrap.find('.cv-pdf-text-layer').remove();
        }
        $(this).toggleClass('cv-active', textLayerVisible);
      });
      /* Add to toolbar only after PDF load when checkPdfHasText confirms content (see loadPromise.then) */
    }

    return {
      toolbar: toolbarItems,
      destroy: function () {
        clearTimeout(pdfResizeTid);
        clearTimeout(scrollTid);
        clearTimeout(zoomRenderTid);
        $(window).off('resize.cv-pdf-autofit');
        $main.off('scroll.cv-pdf-page');
        if (pdfDoc) {
          pdfDoc.destroy();
        }
      }
    };
  }

  function minimalMarkdownToHtml (text) {
    if (isNullish(text) || typeof text !== 'string') {
      return '';
    }
    var s = escHtml(text);
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\n/g, '<br>\n');
    return s;
  }

  /* --- BUILT-IN: INLINE --- */

  /* Extension → Highlight.js language name. Covers common file types; use inline.getLanguage(item) for others. */
  var INLINE_EXT_TO_LANG = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
    ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
    java: 'java', jsp: 'jsp',
    py: 'python', pyw: 'python', pyi: 'python',
    html: 'html', htm: 'html', xhtml: 'xml',
    css: 'css', scss: 'scss', less: 'less', sass: 'scss', styl: 'stylus',
    xml: 'xml', xsd: 'xml', xsl: 'xml', rss: 'xml', atom: 'xml', svg: 'xml', plist: 'xml',
    json: 'json', jsonc: 'json',
    php: 'php', phtml: 'php',
    rb: 'ruby', gemspec: 'ruby', rake: 'ruby',
    go: 'go', golang: 'go',
    rs: 'rust',
    cs: 'csharp',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
    kt: 'kotlin', kts: 'kotlin',
    swift: 'swift',
    scala: 'scala', sc: 'scala',
    clj: 'clojure', cljs: 'clojure', cljc: 'clojure',
    hs: 'haskell', lhs: 'haskell',
    lua: 'lua',
    r: 'r', rdata: 'r', rds: 'r',
    dart: 'dart',
    ex: 'elixir', exs: 'elixir',
    erl: 'erlang', hrl: 'erlang',
    pl: 'perl', pm: 'perl',
    sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', mkdown: 'markdown', mkd: 'markdown',
    toml: 'ini', ini: 'ini', cfg: 'ini',
    dockerfile: 'dockerfile', docker: 'dockerfile',
    makefile: 'makefile', mk: 'makefile', mak: 'makefile',
    gradle: 'gradle',
    groovy: 'groovy', gvy: 'groovy',
    graphql: 'graphql', gql: 'graphql',
    handlebars: 'handlebars', hbs: 'handlebars',
    haml: 'haml',
    coffeescript: 'coffeescript', coffee: 'coffeescript', cson: 'coffeescript',
    diff: 'diff', patch: 'diff',
    proto: 'protobuf', protobuf: 'protobuf',
    vb: 'vbnet', vbs: 'vbscript',
    ps1: 'powershell', ps: 'powershell', psm1: 'powershell',
    fs: 'fsharp', fsx: 'fsharp', fsi: 'fsharp',
    nim: 'nim', nimrod: 'nim',
    cr: 'crystal',
    v: 'verilog', sv: 'verilog', svh: 'verilog',
    jl: 'julia',
    elm: 'elm',
    vue: 'xml',
    svelte: 'svelte',
    tf: 'terraform', hcl: 'terraform',
    sol: 'solidity',
    adoc: 'asciidoc', asciidoc: 'asciidoc',
    nginx: 'nginx', nginxconf: 'nginx',
    apache: 'apache', apacheconf: 'apache',
    env: 'ini',
    csv: 'plaintext'
  };

  function inlineRawToHtml (text) {
    var lines = (isNullish(text) ? '' : String(text)).split(/\r\n|\n|\r/);
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<div class="cv-inline-line">' +
        '<span class="cv-inline-num">' + (i + 1) + '</span>' +
        '<span class="cv-inline-code">' + escHtml(lines[i]) + '</span>' +
        '</div>';
    }
    return html;
  }

  function getInlineLanguage (item, inst) {
    if (inst && inst.opts && inst.opts.inline && typeof inst.opts.inline.getLanguage === 'function') {
      var lang = inst.opts.inline.getLanguage(item);
      if (lang && typeof lang === 'string') {
        return lang.trim().toLowerCase();
      }
    }
    var ext = (item.fileExt || (item.title || '').split('.').pop() || '').toLowerCase();
    return INLINE_EXT_TO_LANG[ext] || ext || null;
  }

  function getInlineBodyHtml (content, item, inst) {
    var raw = isNullish(content) ? '' : String(content);
    if (inst && inst.opts && typeof inst.opts.onInlineHtml === 'function') {
      return inst.opts.onInlineHtml(raw, item, inst);
    }
    var useHljs = inst && inst.opts && inst.opts.inline && inst.opts.inline.syntaxHighlight &&
      typeof window !== 'undefined' && window.hljs && typeof window.hljs.highlight === 'function';
    if (!useHljs) {
      return inlineRawToHtml(raw);
    }
    /* highlight.js v9 API: highlight(languageName, code, ignore_illegals). Highlight the whole block once so multi-line strings, comments, and blocks are correct. */
    var lang = getInlineLanguage(item, inst) || 'plaintext';
    if (typeof window.hljs.getLanguage === 'function' && !window.hljs.getLanguage(lang)) {
      lang = 'plaintext';
    }
    var hl;
    try {
      hl = window.hljs.highlight(lang, raw, true);
    } catch (e) {
      hl = { value: escHtml(raw) };
    }
    var lineParts = hl.value.split(/\r\n|\n|\r/);
    var html = '';
    for (var i = 0; i < lineParts.length; i++) {
      html += '<div class="cv-inline-line">' +
        '<span class="cv-inline-num">' + (i + 1) + '</span>' +
        '<span class="cv-inline-code">' + lineParts[i] + '</span>' +
        '</div>';
    }
    return html;
  }

  function builtInInlineRenderer (item, $stage, inst) {
    function showInline (content) {
      var bodyHtml = getInlineBodyHtml(content, item, inst);
      var $wrap = $(
        '<div class="cv-inline-wrap">' +
          '<div class="cv-inline-body">' + bodyHtml + '</div>' +
        '</div>'
      );
      $stage.append($wrap);
    }

    if (!isNullish(item.content) && typeof item.content === 'string') {
      showInline(item.content);
      return { inlineContent: item.content };
    }
    var inlineSrcUrl = getResolvedSrcUrl(item, inst) || item.src;
    if (inlineSrcUrl && isSafeResourceUrl(inlineSrcUrl)) {
      var $placeholder = $('<div class="cv-inline-wrap"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(inlineSrcUrl, { method: 'GET', credentials: 'include' })
        .then(function (r) {
          return r.text();
        })
        .then(function (text) {
          if (inst) {
            inst._inlineContent = text;
          }
          $placeholder.find('.cv-inline-loading').replaceWith($('<div class="cv-inline-body">').html(getInlineBodyHtml(text, item, inst)));
        })
        .catch(function () {
          $placeholder.remove();
          showError($stage, 'inline', 'Could not load file for inline view', item);
        });
      return {};
    }
    showError($stage, 'inline', 'No content or invalid URL for inline view', item);
    return null;
  }

  /* --- BUILT-IN: UNSUPPORTED / ERROR --- */

  function getErrorMessage (item) {
    var m;
    if (!isNullish(item.message) && item.message !== '') {
      m = item.message;
    } else if (!isNullish(item.errorMessage) && item.errorMessage !== '') {
      m = item.errorMessage;
    } else {
      m = null;
    }
    return (m !== null && m !== undefined) ? String(m) : 'Preview is not available for this file';
  }

  function buildUnsupportedCard (item, message, $stage) {
    var ext = (item.fileExt || (item.title || '').split('.').pop() || '').toUpperCase();
    var size = item.fileSize || '';
    var showDl = Boolean(item.src || item.downloadUrl);
    var $card = $(
      '<div class="cv-unsupported">' +
        '<div class="cv-unsupported-icon">' + Icons.fileIcon + '</div>' +
        (ext ? '<div class="cv-unsupported-ext">' + escHtml(ext) + '</div>' : '') +
        '<div class="cv-unsupported-name">' + escHtml(item.title || 'File') + '</div>' +
        (size ? '<div class="cv-unsupported-size">' + escHtml(size) + '</div>' : '') +
        '<p class="cv-unsupported-msg">' + escHtml(message) + '</p>' +
        (showDl ? '<button class="cv-unsupported-dl" type="button">' + Icons.download + ' Download</button>' : '') +
      '</div>'
    );
    if (showDl) {
      $card.find('.cv-unsupported-dl').on('click', function () {
        performDownload(item, Overlay.activeInstance);
      });
    }
    $stage.append($card);
  }

  function builtInUnsupportedRenderer (item, $stage) {
    buildUnsupportedCard(item, 'Preview is not available for this file', $stage);
  }

  function builtInErrorRenderer (item, $stage) {
    buildUnsupportedCard(item, getErrorMessage(item), $stage);
    return {};
  }

  /* --- BUILT-IN: HTML --- */

  function builtInHtmlRenderer (item, $stage) {
    var inst = Overlay.activeInstance;
    var src = getResolvedSrcUrl(item, inst) || item.src;
    var html = item.html;
    if (src && isSafeResourceUrl(src)) {
      var titleAttr = (!isNullish(item.title) && String(item.title).trim() !== '') ? String(item.title).trim().replace(/"/g, '&quot;') : '';
      /* Full-stage iframe: .cv-stage-iframe is the embed hook (similar role to Colorbox .cboxIframe; do not reuse that class name). */
      var $wrap = $('<div class="cv-html-iframe-wrap cv-html-iframe-loading"></div>');
      /* Same spinner as overlay loader (.cv-spinner); in-stage panel like inline fetch uses .cv-inline-loading pattern. */
      var $iframeLoader = $('<div class="cv-html-iframe-loader" aria-hidden="true"><div class="cv-spinner" role="presentation"></div></div>');
      var $iframe = $('<iframe class="cv-html-iframe cv-stage-iframe"></iframe>');
      if (titleAttr) {
        $iframe.attr('title', titleAttr);
      }
      if (inst && inst.opts && inst.opts.wcag) {
        $iframe.attr('aria-busy', 'true');
      }
      var finished = false;
      var fallbackTid = null;
      var onIframeSettled = function () {
        if (finished) {
          return;
        }
        finished = true;
        if (fallbackTid !== null) {
          clearTimeout(fallbackTid);
          fallbackTid = null;
        }
        $iframe.off('.cvHtmlSrc');
        setTimeout(function () {
          if ($iframeLoader && $iframeLoader.length) {
            $iframeLoader.remove();
          }
          $wrap.removeClass('cv-html-iframe-loading');
        }, 500);
        if (inst && inst.opts && inst.opts.wcag) {
          $iframe.removeAttr('aria-busy');
        }
      };
      $iframe.on('load.cvHtmlSrc', onIframeSettled);
      $iframe.on('error.cvHtmlSrc', onIframeSettled);
      $wrap.append($iframeLoader);
      $wrap.append($iframe);
      $stage.append($wrap);
      /* Bind load/error before src so cached documents still notify. */
      $iframe.attr('src', src);
      fallbackTid = setTimeout(onIframeSettled, 120000);
      return {
        destroy: function () {
          if (fallbackTid !== null) {
            clearTimeout(fallbackTid);
            fallbackTid = null;
          }
          $iframe.off('.cvHtmlSrc');
          if (!finished) {
            onIframeSettled();
          }
        }
      };
    }
    if (isNullish(html) || (typeof html === 'string' && String(html).trim() === '')) {
      showError($stage, 'html', 'No HTML or src provided for html view', item);
      return null;
    }
    Overlay.$loader.addClass('cv-active');
    if (typeof html === 'string') {
      $stage.append($(html));
    } else if (html.jquery) {
      $stage.append(html);
    } else if (html.nodeType) {
      $stage.append(html);
    } else {
      Overlay.$loader.removeClass('cv-active');
      showError($stage, 'html', 'No HTML provided for html view', item);
      return null;
    }
    setTimeout(function () {
      Overlay.$loader.removeClass('cv-active');
    }, 120);
    return {};
  }

  /* --- BUILT-IN: MARKDOWN --- */

  function builtInMarkdownRenderer (item, $stage, inst) {
    function getMarkdownRenderer () {
      if (typeof window.marked === 'function' || (window.marked && typeof window.marked.parse === 'function')) {
        return function (md) {
          return window.marked.parse ? window.marked.parse(md) : window.marked(md);
        };
      }
      return minimalMarkdownToHtml;
    }

    function showMarkdown (html) {
      var $wrap = $('<div class="cv-markdown-body"></div>').html(html);
      $stage.append($wrap);
    }

    if (!isNullish(item.content) && typeof item.content === 'string') {
      var renderer = getMarkdownRenderer();
      var raw = item.content;
      var html = renderer(raw);
      if (inst) {
        inst._markdownRaw = raw;
        inst._markdownHtml = html;
        inst._markdownViewMode = 'rendered';
      }
      showMarkdown(html);
      return {};
    }
    var markdownSrcUrl = getResolvedSrcUrl(item, inst) || item.src;
    if (markdownSrcUrl && isSafeResourceUrl(markdownSrcUrl)) {
      var fetchUrl = markdownSrcUrl;
      if (fetchUrl.indexOf('http') !== 0 && fetchUrl.indexOf('blob') !== 0 && fetchUrl.indexOf('data:') !== 0) {
        try {
          fetchUrl = new URL(fetchUrl, window.location.href).href;
        } catch (e) {}
      }
      if (inst) {
        inst._markdownViewMode = 'rendered';
        inst._markdownRaw = null;
        inst._markdownHtml = null;
      }
      Overlay.$loader.addClass('cv-active');
      var $placeholder = $('<div class="cv-markdown-body"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(fetchUrl, { method: 'GET', credentials: 'include' })
        .then(function (r) {
          if (!r.ok) {
            throw new Error('HTTP ' + r.status);
          }
          return r.text();
        })
        .then(function (text) {
          var renderer = getMarkdownRenderer();
          var html = renderer(text);
          if (inst) {
            inst._markdownRaw = text;
            inst._markdownHtml = html;
          }
          $placeholder.html(html);
          Overlay.$loader.removeClass('cv-active');
        })
        .catch(function () {
          $placeholder.remove();
          Overlay.$loader.removeClass('cv-active');
          showError($stage, 'markdown', 'Could not load file for markdown view', item);
        });
      return {};
    }
    showError($stage, 'markdown', 'No content or invalid URL for markdown view', item);
    return null;
  }

  function showError ($stage, type, message, item, options) {
    options = options || {};
    var inst = Overlay.activeInstance;
    if (inst && typeof inst.opts.onError === 'function') {
      var handled = inst.opts.onError({ type: type, message: message, item: item, $stage: $stage });
      if (handled === true) {
        return;
      }
    }
    builtInErrorCard($stage, message, item, options);
  }

  function builtInErrorCard ($stage, message, item, options) {
    options = options || {};
    var showDl = !options.noDownload && getItemDownloadUrl(item);
    var $card = $(
      '<div class="cv-error-card">' + Icons.error +
        '<p class="cv-error-text">' + escHtml(message) + '</p>' +
        (showDl ? '<button class="cv-error-dl" type="button">' + Icons.download + ' Download source</button>' : '') +
      '</div>'
    );
    if (showDl) {
      $card.find('.cv-error-dl').on('click', function () {
        performDownload(item, Overlay.activeInstance);
      });
    }
    $stage.append($card);
  }

  /* --- COMPONENTVIEWER CLASS --- */

  function ComponentViewer ($container, options) {
    this.id = ++ComponentViewer._counter;
    this.$container = $container;
    this.opts = $.extend(true, {}, DEFAULTS, options);
    var so = this.opts.stageOnly;
    if (so === true || so === false) {
      this.opts.stageOnly = { enabled: Boolean(so), hideNavigation: false };
    } else if (so && typeof so === 'object') {
      this.opts.stageOnly = $.extend({}, DEFAULTS.stageOnly, so);
    } else {
      this.opts.stageOnly = $.extend({}, DEFAULTS.stageOnly);
    }
    this.items = []; this.idx = 0; this._currentResult = null;
    this._collectItems(); this._bindClicks();
  }
  ComponentViewer._counter = 0;

  ComponentViewer.prototype = {
    constructor: ComponentViewer,
    _indexOfItemByElement: function (el) {
      var node = el && el.jquery ? el[0] : el;
      if (!node) {
        return -1;
      }
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i].$el && this.items[i].$el[0] === node) {
          return i;
        }
      }
      return -1;
    },
    _collectItems: function () {
      var self = this;
      this.items = [];
      if (self.opts.items && Array.isArray(self.opts.items) && self.opts.items.length > 0) {
        self.items = self.opts.items.slice();
        return;
      }
      this.$container.find(this.opts.selector).each(function () {
        var $el = $(this);
        var src = $el.attr('data-src') || $el.data('src') || $el.attr('href') || $el.find('img').attr('src');
        var fileExt = ($el.data('ext') || (src || '').split('.').pop() || '').toLowerCase();
        var defaultType = $el.data('type') || (fileExt === 'md' ? 'markdown' : 'image');
        var defaultItem = {
          type: defaultType,
          src: src,
          title: $el.data('title') || $el.attr('title') || '',
          downloadUrl: $el.data('download') || null,
          zoomUrl: $el.data('zoomurl') || $el.data('zoom-url') || null,
          fileExt: $el.data('ext') || null,
          fileSize: $el.data('size') || null,
          mimeType: $el.data('mime') || null,
          thumbnailUrl: $el.data('thumbnail') || $el.data('poster') || null,
          message: $el.data('message') || null,
          html: $el.data('html') || null,
          content: $el.data('content') || null,
          comment: $el.data('comment') || null,
          author: $el.data('author') || null,
          comments: (function () {
            try {
              var c = $el.data('comments');
              if (Array.isArray(c)) {
                return c;
              }
              if (typeof c === 'string') {
                return JSON.parse(c);
              }
            } catch (e) {}
            return undefined;
          }()),
          pollOptionLabel: $el.data('pollOptionLabel') || null,
          pollOptionId: !isNullish($el.data('pollOptionId')) ? $el.data('pollOptionId') : null,
          pollOptionSelected: $el.data('pollOptionSelected') || $el.data('poll-option-selected') || false
        };
        var item = typeof self.opts.itemData === 'function' ? self.opts.itemData($el, defaultItem) : defaultItem;
        if (isNullish(item)) {
          item = defaultItem;
        }
        item.$el = $el; self.items.push(item);
      });
    },
    _bindClicks: function () {
      var self = this;
      var containerEl = this.$container[0];
      if (!containerEl) {
        return;
      }
      if (this._containerCaptureClick) {
        containerEl.removeEventListener('click', this._containerCaptureClick, true);
        this._containerCaptureClick = null;
      }
      var handler = function (e) {
        var $target = $(e.target);
        var $matched = $target.closest(self.opts.selector);
        if (!$matched.length) {
          return;
        }
        if (!$matched.closest(self.$container).length) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        self._collectItems();
        var item = null;
        for (var i = 0; i < self.items.length; i++) {
          if (self.items[i].$el && self.items[i].$el[0] === $matched[0]) {
            item = self.items[i];
            break;
          }
        }
        if (!item && self.items.length > 0) {
          item = self.items[0];
        }
        if (typeof self.opts.beforeOpen !== 'function') {
          self._openContext = {};
        }
        self.open($matched);
      };
      this._containerCaptureClick = handler;
      containerEl.addEventListener('click', handler, true);
    },
    open: function (indexOrElement) {
      this._collectItems();
      if (this.items.length === 0) {
        return;
      }
      var self = this;
      var idx = 0;
      if (indexOrElement !== undefined && indexOrElement !== null) {
        if (typeof indexOrElement === 'number') {
          idx = Math.max(0, Math.min(indexOrElement, this.items.length - 1));
        } else {
          var el = indexOrElement && indexOrElement.jquery ? indexOrElement[0] : indexOrElement;
          for (var i = 0; i < this.items.length; i++) {
            if (this.items[i].$el && this.items[i].$el[0] === el) {
              idx = i;
              break;
            }
          }
        }
      }
      var item = this.items[idx];
      var $matched = (item && item.$el && item.$el.length) ? item.$el : $();
      if (typeof this.opts.beforeOpen === 'function') {
        this.idx = idx;
        this._slideshowPaused = false;
        this._slideshowPlaying = false;
        this._beforeOpenPhase = 'loading';
        this._pendingGateContent = null;
        this._openContext = {};
        Overlay.open(this);
        setTimeout(function () {
          if (typeof self.opts.beforeOpen !== 'function') {
            return;
          }
          self.opts.beforeOpen(item, $matched, function (arg) {
            if (arg && arg.gateContent) {
              self._pendingGateContent = arg.gateContent;
              self._openContext = {};
            } else {
              self._openContext = arg || {};
              self._pendingGateContent = null;
            }
            Overlay._finishBeforeOpenProceed(self);
          });
        }, 0);
        return;
      }
      this.idx = idx;
      this._slideshowPaused = false;
      this._slideshowPlaying = false;
      this._openContext = {};
      Overlay.open(this);
    },
    close: function () {
      Overlay.close();
    },
    next: function (opts) {
      this._collectItems();
      if (this.items.length < 2) {
        return;
      }
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer); this._slideshowTimer = null;
      }
      var currentItem = this.items[this.idx];
      var currentIdx = (currentItem && currentItem.$el) ? this._indexOfItemByElement(currentItem.$el) : this.idx;
      if (currentIdx < 0) {
        currentIdx = 0;
      }
      this._firePrevClose(this.items[currentIdx]);
      this.idx = this.opts.loop ? (currentIdx + 1) % this.items.length : Math.min(this.items.length - 1, currentIdx + 1);
      Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    prev: function (opts) {
      this._collectItems();
      if (this.items.length < 2) {
        return;
      }
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer); this._slideshowTimer = null;
      }
      var currentItem = this.items[this.idx];
      var currentIdx = (currentItem && currentItem.$el) ? this._indexOfItemByElement(currentItem.$el) : this.idx;
      if (currentIdx < 0) {
        currentIdx = this.items.length - 1;
      }
      this._firePrevClose(this.items[currentIdx]);
      this.idx = this.opts.loop ? (currentIdx - 1 + this.items.length) % this.items.length : Math.max(0, currentIdx - 1);
      Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    goTo: function (index, opts) {
      this._collectItems();
      if (this.items.length === 0) {
        return;
      }
      var idx = Math.max(0, Math.min(index, this.items.length - 1));
      if (idx === this.idx) {
        return;
      }
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer); this._slideshowTimer = null;
      }
      this._firePrevClose(this.items[this.idx]);
      this.idx = idx;
      Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    currentItem: function () {
      return this.items[this.idx];
    },
    setTheme: function (theme) {
      if (theme !== 'dark' && theme !== 'light') {
        return;
      }
      this.opts.theme = theme;
      if (Overlay.activeInstance === this) {
        Overlay.$el[0].className = 'cv-overlay cv-theme-' + theme;
        Overlay._syncThemeToggle();
      }
      if (typeof this.opts.onThemeChange === 'function') {
        this.opts.onThemeChange(theme, this);
      }
    },
    refresh: function () {
      var wasOpen = Overlay.visible && Overlay.activeInstance === this;
      this._collectItems(); this._bindClicks();
      if (wasOpen && this.items.length) {
        this.idx = Math.min(this.idx, this.items.length - 1); Overlay.loadItem();
      } else if (wasOpen) {
        this.close();
      }
    },
    /** Show the circle loader over the stage. No-op if this instance is not the active viewer. */
    showLoader: function () {
      if (Overlay.activeInstance === this && Overlay.$loader && Overlay.$loader.length) {
        Overlay.$loader.addClass('cv-active');
      }
    },
    /** Hide the circle loader. No-op if this instance is not the active viewer. */
    hideLoader: function () {
      if (Overlay.activeInstance === this && Overlay.$loader && Overlay.$loader.length) {
        Overlay.$loader.removeClass('cv-active');
      }
    },
    /**
     * Show a strip message inside the overlay (e.g. "Copied", "Saved"). No-op if this instance is not the active viewer.
     * @param {string} text - Message text to display.
     * @param {number} [durationMs] - How long to show the message in ms; default 2000.
     */
    showStripMessage: function (text, durationMs) {
      if (Overlay.activeInstance !== this) {
        return;
      }
      if (!Overlay.$stripMessage || !Overlay.$stripMessage.length) {
        return;
      }
      Overlay._showStripMessage(text, durationMs);
    },
    destroy: function () {
      var containerEl = this.$container && this.$container[0];
      if (containerEl && this._containerCaptureClick) {
        containerEl.removeEventListener('click', this._containerCaptureClick, true);
        this._containerCaptureClick = null;
      }
      this.$container.removeData('cv-instance');
      if (Overlay.$tooltip && Overlay.$tooltip.length) {
        Overlay.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true').remove();
        Overlay.$tooltip = $();
      }
      $('body .cv-tooltip').remove();
      if (Overlay.activeInstance === this) {
        Overlay.close();
      } else if (!Overlay.activeInstance && Overlay.$el && Overlay.$el.length) {
        Overlay.$el.remove();
        Overlay.built = false;
        Overlay.$el = null;
        Overlay.$shell = null; Overlay.$stage = null; Overlay.$stageWrap = null; Overlay.$toolbar = null;
        Overlay.$loader = null; Overlay.$prev = null; Overlay.$next = null; Overlay.$footer = null;
      }
      this.items = []; this.opts = null;
    },
    _firePrevClose: function (item) {
      if (typeof this.opts.onClose === 'function' && item) {
        this.opts.onClose(item, this);
      }
    }
  };

  /* --- JQUERY PLUGIN --- */

  $.fn[PLUGIN_NAME] = function (methodOrOptions) {
    if (typeof methodOrOptions === 'string') {
      var args = [].slice.call(arguments, 1),
        ret;
      this.each(function () {
        var inst = $(this).data('cv-instance');
        if (inst && typeof inst[methodOrOptions] === 'function') {
          ret = inst[methodOrOptions].apply(inst, args);
        }
      });
      return ret !== undefined ? ret : this;
    }
    Overlay._bindKeydownCaptureOnce();
    return this.each(function () {
      var $el = $(this);
      var existing = $el.data('cv-instance');
      if (existing && typeof existing.destroy === 'function') {
        existing.destroy();
      }
      $el.data('cv-instance', new ComponentViewer($el, methodOrOptions));
    });
  };

  $.fn[PLUGIN_NAME].defaults = DEFAULTS;
  $.fn[PLUGIN_NAME].Icons = Icons;
  $.fn[PLUGIN_NAME].defaultStrings = DEFAULT_STRINGS;

  /** Return the currently open ComponentViewer instance, or null if the overlay is closed. */
  $.fn[PLUGIN_NAME].getActive = function () {
    return Overlay.visible ? Overlay.activeInstance : null;
  };

  /** Static API: $.componentViewer(options) creates a throwaway container, inits the plugin, returns it. Chain .componentViewer('open', 0) to open. */
  $[PLUGIN_NAME] = function (options) {
    var $container = $('<div>');
    $container[PLUGIN_NAME](options);
    return $container;
  };

}(jQuery, window, document));