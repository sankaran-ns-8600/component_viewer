/**
 * ComponentViewer (Japanese / 日本語)
 *
 * Same as component-viewer.js but with DEFAULT_STRINGS in Japanese for I18N demo.
 * Use this file instead of component-viewer.js when you want Japanese UI strings by default.
 *
 * Common outer wrapper + toolbar with built-in renderers.
 *
 * Built-in renderers:
 *   image   – zoom slider, wheel/pinch zoom, drag pan (clamped). Includes GIF; animation is preserved by the browser when using <img src="...">.
 *   video   – jPlayer powered (falls back to unsupported if jPlayer not loaded)
 *   audio   – jPlayer powered (falls back to unsupported if jPlayer not loaded)
 *   pdf     – pdf.js powered (falls back to unsupported if pdfjsLib not loaded)
 *   markdown – Markdown rendered as HTML (item.content or fetch item.src; uses window.marked when present, else minimal built-in parser)
 *
 * Renderer priority:
 *   1. onRender callback (customer full override — gets first shot)
 *   2. Built-in renderer for the type
 *   3. Unsupported / no-preview card
 *
 * Toolbar priority:
 *   - onRender returns { toolbar } → full replacement (no auto download/zoom)
 *   - Built-in renderer returns toolbar → merged with toolbarItems + download + zoom
 *   - onToolbar callback can modify/replace the resolved toolbar before rendering
 *
 * Instantiated per-post (not globally).
 *
 * (c) 2026 | MIT License
 */
;(function($, window, document) {
  'use strict';

  var PLUGIN_NAME = 'componentViewer';
  var jpCounter = 0;
  var SLIDESHOW_DEFAULT_INTERVAL = 4;

  /* ═══════════════════════════════════════════════════════════════════
     DEFAULT OPTIONS
     ═══════════════════════════════════════════════════════════════════ */

  var DEFAULTS = {
    selector: '.cv-item',
    loop: true,
    overlayClose: true,
    keyboardNav: true,
    showCounter: true,   // when false, hide the "1 / 6" counter in the header
    preloadAdjacentImages: true,   // when true, preload next/prev item if image so navigation is instant (Colorbox-style)
    /** When true, hide header and footer completely; only the center stage and prev/next navigation are shown. Close via Escape or backdrop click. Default false. Can be an object: { enabled: false, hideNavigation: false }. When hideNavigation is true, prev/next buttons are hidden; user can still move with keyboard (arrow keys). */
    stageOnly: { enabled: false, hideNavigation: false },
    /**
     * Carousel: strip of thumbnails below the stage. Set to an object to configure.
     * carousel: { enabled: true, navThreshold: 4 }
     * - enabled: when true, a header button toggles the carousel strip (thumbnails). Default false.
     * - navThreshold: when item count exceeds this, show prev/next buttons to scroll the carousel (default 4).
     */
    carousel: { enabled: false, navThreshold: 4 },
    /**
     * Slideshow: auto-advance to next item. Set to an object to enable.
     * slideshow: { enabled: true, interval: 4, autoStart: true, advanceMedia: 'interval', showProgress: false }
     * - interval: seconds to show each item before advancing (default 4)
     * - autoStart: if true, slideshow starts when overlay opens; if false, user must click Play slideshow
     * - advanceMedia: 'interval' = use same interval for all types; 'onEnd' = for video/audio advance when playback ends (falls back to interval if no media element)
     * - hideSlideshowButton: when true and autoStart is true, the Play/Pause slideshow button is hidden (only considered when autoStart is true)
     * - showProgress: when true, a progress bar in the footer shows time until next slide (default false)
     */
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
      zoom: true
    },

    zoom: {
      min: 1,
      max: 5,
      step: 0.01,
      wheelStep: 0.15,
      showPercentage: false,   // if true, show zoom percentage (e.g. "150%") in the zoom widget
      onZoom: null             // function(zoomLevel, item, viewer)
    },

    pdf: {
      workerSrc: null,
      cMapUrl: null,          // e.g. 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/'
      cMapPacked: true,
      annotations: true,      // render PDF annotations (links, highlights); compatible with PDF.js 2.2.x and 3.x (uses Util.normalizeRect when available, else internal fallback)
      autoFit: true,          // if true, scale page to fit stage (width and height); if false, fit to width only
      autoFitMaxScale: 2.5    // max scale when autoFit is true (cap zoom)
    },

    /**
     * Supported media formats (jPlayer supplied string).
     * Format is derived from file extension; these options restrict/override.
     * Use supportedVideoFormats for video, supportedAudioFormats for audio.
     * Per-item override: set item.supplied in itemData if needed.
     *
     * Examples: 'm4v', 'm4v, webmv', 'mp3', 'mp3, oga'
     */
    supportedVideoFormats: null,
    supportedAudioFormats: null,

    toolbarItems: [],

    onDownload: null,
    itemData: null,

    /**
     * Customer full override. Called for EVERY item (including image).
     * If it renders something into $stage, the built-in renderer is skipped.
     * Return: { toolbar: [...], destroy: fn }
     */
    onRender: null,

    /**
     * Toolbar modifier. Called AFTER toolbar is resolved (from built-in or default).
     * Receives the default toolbar array — modify it and return, or return a new array.
     *   onToolbar(item, defaultToolbar, viewer)
     * Not called when onRender provides a toolbar (customer has full control).
     */
    onToolbar: null,

    onLoading: null,
    onOpen: null,
    /** Fires right after the current item's content is displayed (after transition if any). Similar to Colorbox onComplete. */
    onComplete: null,
    /** Fires at the start of the close process, before teardown. Similar to Colorbox onCleanup. */
    onCleanup: null,
    onClose: null,

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
     *   onSelect: function(item, selected, viewer) — selected is true/false
     */
    pollOption: null
  };

  /* ═══════════════════════════════════════════════════════════════════
     DEFAULT STRINGS (I18N) — single source for all user-facing text
     ═══════════════════════════════════════════════════════════════════ */

  /* Japanese (日本語) — same keys as English; replace DEFAULT_STRINGS to localize */
  var DEFAULT_STRINGS = {
    close: '閉じる',
    fullscreen: '全画面',
    exitFullscreen: '全画面を終了',
    attachments: '添付',
    showAttachments: '添付を表示',
    scrollCarouselLeft: 'カルーセルを左に',
    scrollCarouselRight: 'カルーセルを右に',
    previousItem: '前の項目',
    nextItem: '次の項目',
    zoomOut: '縮小',
    zoomLevel: 'ズームレベル',
    zoomIn: '拡大',
    switchToLightMode: 'ライトモードに切り替え',
    switchToDarkMode: 'ダークモードに切り替え',
    playSlideshow: 'スライドショーを再生',
    pauseSlideshow: 'スライドショーを一時停止',
    download: 'ダウンロード',
    downloadSource: '元をダウンロード',
    invalidImageUrl: '無効または安全でない画像URL',
    imageLoadFailed: '画像を読み込めませんでした',
    play: '再生',
    pause: '一時停止',
    playbackSpeed: '再生速度',
    cyclePlaybackSpeed: '再生速度を切り替え',
    hd: 'HD',
    toggleHd: 'HD切り替え',
    mute: 'ミュート',
    unmute: 'ミュート解除',
    thumbnails: 'サムネイル',
    previousPage: '前のページ',
    nextPage: '次のページ',
    rotate: '回転',
    print: '印刷',
    pdf: 'PDF',
    previewNotAvailable: 'このファイルのプレビューはありません',
    file: 'ファイル',
    audio: 'オーディオ',
    couldNotLoadFileInline: 'インラインビュー用にファイルを読み込めませんでした',
    noContentInline: 'コンテンツがありません、または無効なURL',
    noHtmlProvided: 'HTMLが提供されていません',
    typeVideo: 'ビデオ',
    typeCode: 'コード',
    typeHtml: 'HTML',
    typeError: '—',
    carouselItemLabel: '項目 %1 / %2',
    playPause: '再生 / 一時停止',
    muteUnmute: 'ミュート / ミュート解除',
    showShortcuts: 'ショートカットを表示',
    keyboardShortcuts: 'キーボードショートカット',
    toggleTheme: 'テーマを切り替え',
    toggleSlideshow: 'スライドショー 再生 / 一時停止'
  };

  /**
   * Resolve a string by key from the registry (plugin defaultStrings or DEFAULT_STRINGS). Used for I18N.
   */
  function str(inst, key) {
    var reg = ($ && $.fn && $.fn[PLUGIN_NAME] && $.fn[PLUGIN_NAME].defaultStrings) || DEFAULT_STRINGS;
    var v = reg[key];
    return (v != null && v !== '') ? String(v) : key;
  }

  /* ═══════════════════════════════════════════════════════════════════
     ICONS
     ═══════════════════════════════════════════════════════════════════ */

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
    themeLight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    themeDark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    fullscreen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    fullscreenExit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>'
  };

  /**
   * Escape a string for safe use in HTML (prevents XSS from item.title / fileName / fileSize etc.).
   * Coerces to string so non-primitive values cannot inject script.
   */
  function escHtml(s) {
    var str = (s == null || s === '') ? '' : (typeof s === 'string' ? s : String(s));
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /**
   * Safe string for use as download filename (a.download). Strips characters that could
   * cause XSS or path injection if the value were ever reflected in HTML or file paths.
   */
  function safeDownloadFilename(s) {
    var str = (s == null || s === '') ? 'file' : (typeof s === 'string' ? s : String(s));
    return str.replace(/[\0-\x1f<>:"/\\|?*\x7f]/g, '').trim() || 'file';
  }

  /**
   * Returns true if the URL is safe for loading as a resource (img, video, audio, PDF).
   * Rejects javascript:, vbscript:, and other script/data URLs that could execute code.
   */
  function isSafeResourceUrl(url) {
    if (url == null || typeof url !== 'string') return false;
    var u = url.trim();
    var lower = u.toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('vbscript:') === 0) return false;
    if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0 || lower.indexOf('blob:') === 0) return true;
    if (lower.indexOf('data:') === 0) {
      var after = lower.slice(5).split(',')[0];
      var mime = after.split(';')[0].trim();
      if (mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0 || mime.indexOf('audio/') === 0 || mime === 'application/pdf') return true;
      return false;
    }
    /* Relative URLs (same-origin): safe for fetch/text, e.g. "sample.md", "./file.md", "/path/file.md" */
    if (u.indexOf(':') < 0 || u.indexOf('/') === 0 || u.indexOf('./') === 0 || u.indexOf('../') === 0) return true;
    return false;
  }

  /**
   * Returns true if the URL is safe for use as a download link (a.href).
   * Allows only http(s) and blob to prevent javascript: or data: script execution.
   */
  function isSafeDownloadUrl(url) {
    if (url == null || typeof url !== 'string') return false;
    var u = url.trim().toLowerCase();
    if (u.indexOf('javascript:') === 0 || u.indexOf('vbscript:') === 0 || u.indexOf('data:') === 0) return false;
    if (u.indexOf('http://') === 0 || u.indexOf('https://') === 0 || u.indexOf('blob:') === 0) return true;
    return false;
  }

  /**
   * Sanitize HTML string for use as toolbar icon to prevent XSS (e.g. <svg onload="..."> or <script>).
   * Removes script elements and event-handler attributes.
   */
  function sanitizeIconHtml(html) {
    if (html == null || typeof html !== 'string') return '';
    var div = document.createElement('div');
    div.innerHTML = html;
    var scripts = div.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    var all = div.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = [];
      for (var k = 0; k < el.attributes.length; k++) attrs.push(el.attributes[k].name);
      attrs.forEach(function(name) {
        if (name.toLowerCase().indexOf('on') === 0) el.removeAttribute(name);
        else if ((name === 'href' || name === 'xlink:href') && el.getAttribute(name)) {
          var val = (el.getAttribute(name) || '').trim().toLowerCase();
          if (val.indexOf('javascript:') === 0 || val.indexOf('vbscript:') === 0) el.setAttribute(name, '#');
        }
      });
    }
    return div.innerHTML;
  }

  function getMediaSupplied(item, inst) {
    if (item.supplied) return String(item.supplied).split(',')[0].trim();
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
        var list = listStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (list.length) {
          return list.indexOf(fromExt) >= 0 ? fromExt : list[0];
        }
      }
    }
    return fromExt;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SHARED OVERLAY
     ═══════════════════════════════════════════════════════════════════ */

  var Overlay = {
    built: false, visible: false, activeInstance: null,
    _bodyOverflow: null,
    $el: null, $shell: null, $title: null, $counter: null,
    $stageWrap: null, $stage: null, $loader: null,
    $prev: null, $next: null, $footer: null,
    $pollOption: null, $footerRow: null,
    $toolbar: null, $zoomWidget: null, $zoomSlider: null, $zoomPct: null,

    _zoom: 1, _panX: 0, _panY: 0,
    _isPanning: false, _panOriginX: 0, _panOriginY: 0, _panStartX: 0, _panStartY: 0,
    _pinchStartDist: 0, _pinchStartZoom: 1,
    _pinchMidX: 0, _pinchMidY: 0, _pinchPanStartX: 0, _pinchPanStartY: 0,
    _justEndedPinch: false,
    _isImageItem: false, _isPdfItem: false, _isCustomRendered: false,
    _swipeStartX: 0, _swipeStartY: 0, _swipeEndX: 0, _swipeEndY: 0, _swipeTracking: false,

    ensure: function() {
      if (this.built) return;
      var html =
        '<div class="cv-overlay">' +
          '<div class="cv-backdrop" aria-hidden="true"></div>' +
          '<div class="cv-shell" id="cv-dialog">' +
            '<div class="cv-header">' +
              '<div class="cv-header-left"><span class="cv-counter" id="cv-dialog-desc"></span></div>' +
              '<div class="cv-header-center"><span class="cv-title" id="cv-dialog-title"></span></div>' +
              '<div class="cv-header-right">' +
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
          '</div>' +
        '</div>';

      $('body').append(html);
      if (!$('#cv-tooltip').length) $('body').append('<div class="cv-tooltip" id="cv-tooltip" aria-hidden="true"></div>');
      this.$el         = $('.cv-overlay').last();
      this.$backdrop   = this.$el.find('.cv-backdrop');
      this.$shell      = this.$el.find('.cv-shell');
      this.$title       = this.$el.find('.cv-title');
      this.$counter     = this.$el.find('.cv-counter');
      this.$themeToggle = this.$el.find('.cv-theme-toggle');
      this.$fullscreenToggle = this.$el.find('.cv-fullscreen-toggle');
      this.$stageWrap  = this.$el.find('.cv-stage-wrap');
      this.$stage      = this.$el.find('.cv-stage');
      this.$loader     = this.$el.find('.cv-loader');
      this.$prev       = this.$el.find('.cv-nav-prev');
      this.$next       = this.$el.find('.cv-nav-next');
      this.$carouselWrap   = this.$el.find('.cv-carousel-wrap');
      this.$carousel       = this.$el.find('.cv-carousel');
      this.$carouselToggle = this.$el.find('.cv-carousel-toggle');
      this.$carouselPrev   = this.$el.find('.cv-carousel-prev');
      this.$carouselNext   = this.$el.find('.cv-carousel-next');
      this.$footer     = this.$el.find('.cv-footer');
      this.$pollOption = this.$el.find('.cv-poll-option');
      this.$footerRow  = this.$el.find('.cv-footer-row');
      this.$toolbar    = this.$el.find('.cv-toolbar');
      this.$zoomWidget = this.$el.find('.cv-zoom-widget');
      this.$zoomSlider = this.$el.find('.cv-zoom-slider');
      this.$zoomPct    = this.$el.find('.cv-zoom-pct');
      this.$slideshowProgressWrap = this.$el.find('.cv-slideshow-progress-wrap');
      this.$slideshowProgressBar  = this.$el.find('.cv-slideshow-progress-bar');
      this.$shortcutsPopup = this.$el.find('.cv-shortcuts-popup');
      this.$tooltip   = $('#cv-tooltip');
      this.$zoomPct.hide();  // shown only when zoom.showPercentage is true (see _resolveToolbar)
      this._bindEvents();
      this._bindTooltip();
      this.built = true;
    },

    _bindEvents: function() {
      var self = this;
      this.$el.find('.cv-close').on('click', function() { self.close(); });
      this.$themeToggle.on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!self.activeInstance) return;
        var inst = self.activeInstance;
        var current = inst.opts.theme || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        inst.opts.theme = next;
        self.$el[0].className = 'cv-overlay cv-visible cv-theme-' + next;
        self._syncThemeToggle();
        if (typeof inst.opts.onThemeChange === 'function') inst.opts.onThemeChange(next, inst);
        return false;
      });
      this.$carouselToggle.on('click', function(e) {
        e.preventDefault();
        if (!self.activeInstance) return;
        self._carouselOpen = !self._carouselOpen;
        if (self._carouselOpen) self.$carouselWrap.addClass('cv-open'); else self.$carouselWrap.removeClass('cv-open');
        self.$carouselToggle.attr('aria-expanded', self._carouselOpen);
        self._updateCarouselNavVisibility(self.activeInstance);
      });
      this.$fullscreenToggle.on('click', function(e) {
        e.preventDefault();
        if (!self.activeInstance) return;
        self._toggleOverlayFullscreen();
      });
      this.$carouselPrev.on('click', function(e) {
        e.preventDefault();
        var el = self.$carousel[0];
        if (el) el.scrollLeft -= (104 + 10) * 5;
      });
      this.$carouselNext.on('click', function(e) {
        e.preventDefault();
        var el = self.$carousel[0];
        if (el) el.scrollLeft += (104 + 10) * 5;
      });
      this.$prev.on('click', function() { self._nav('prev'); });
      this.$next.on('click', function() { self._nav('next'); });
      /* Backdrop close: only when the backdrop element itself is the click target (no delegation). */
      this.$backdrop[0].addEventListener('click', function backdropClick(e) {
        if (e.target !== self.$backdrop[0]) return;
        if (!self.activeInstance || !self.activeInstance.opts.overlayClose) return;
        self.close();
      });
      $(document).on('fullscreenchange.cv-overlay-fullscreen webkitfullscreenchange.cv-overlay-fullscreen mozfullscreenchange.cv-overlay-fullscreen msfullscreenchange.cv-overlay-fullscreen', function() {
        setTimeout(function() {
          if (self.$fullscreenToggle.length && self.$fullscreenToggle.is(':visible')) self._syncFullscreenToggle();
        }, 0);
      });
      $(document).on('keydown.cv-overlay', function(e) {
        if (!self.visible || !self.activeInstance) return;
        if (!self.activeInstance.opts.keyboardNav) return;
        var popupOpen = self.$shortcutsPopup.hasClass('cv-open');
        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          e.preventDefault();
          if (self.activeInstance.opts.shortcutsPopup !== false) {
            if (popupOpen) self._hideShortcutsPopup();
            else self._showShortcutsPopup();
          }
          return;
        }
        if (e.key === 'Escape') {
          if (popupOpen) {
            e.preventDefault();
            self._hideShortcutsPopup();
            return;
          }
          /* Escape closes the current fullscreen first (video or overlay); only close overlay when nothing is fullscreen */
          var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
          if (fsEl) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
            setTimeout(function() { self._syncFullscreenToggle(); }, 0);
            e.preventDefault();
            return;
          }
          self.close();
          return;
        }
        if (e.key === 'ArrowLeft') { self._nav('prev'); return; }
        if (e.key === 'ArrowRight') { self._nav('next'); return; }
        /* + / - / = zoom when viewing image or PDF (ignore when focus in input/textarea) */
        var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (!/(input|textarea|select)/.test(tag) && (e.key === '+' || e.key === '=' || e.key === '-')) {
          if (self._isImageItem) {
            e.preventDefault();
            var zo = self._zoomOpts();
            var step = (zo.wheelStep != null ? zo.wheelStep : 0.25);
            if (e.key === '-') {
              self._setZoom(Math.max(zo.min, self._zoom - step));
            } else {
              self._setZoom(Math.min(zo.max, self._zoom + step));
            }
            return;
          }
          if (self._isPdfItem) {
            e.preventDefault();
            var $pdfZoomOut = self.$toolbar.find('.cv-tb-pdf-zoom-out:visible');
            var $pdfZoomIn = self.$toolbar.find('.cv-tb-pdf-zoom-in:visible');
            if (e.key === '-' && $pdfZoomOut.length) $pdfZoomOut.first().trigger('click');
            else if ((e.key === '+' || e.key === '=') && $pdfZoomIn.length) $pdfZoomIn.first().trigger('click');
            return;
          }
        }
        if (e.key === 'Tab' && self.activeInstance.opts.wcag) {
          var popupOpen = self.$shortcutsPopup.hasClass('cv-open');
          var container = popupOpen ? self.$shortcutsPopup[0] : self.$shell[0];
          if (!container) return;
          var focusable = container.querySelectorAll('button, [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
          var list = [].slice.call(focusable).filter(function(el) {
            var style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && (el.offsetParent !== null || el.getBoundingClientRect().width > 0);
          });
          if (list.length === 0) return;
          var inside = container.contains(e.target);
          var idx = list.indexOf(e.target);
          if (!inside || idx === -1) {
            e.preventDefault();
            list[0].focus();
            return;
          }
          if (e.shiftKey) {
            if (idx === 0) { e.preventDefault(); list[list.length - 1].focus(); }
          } else {
            if (idx === list.length - 1) { e.preventDefault(); list[0].focus(); }
          }
        }
        var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (/(input|textarea|select)/.test(tag)) return;
        var hasBuiltInMedia = !self._isCustomRendered && self.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
        if (e.key === ' ' && hasBuiltInMedia) {
          e.preventDefault();
          var $pause = self.$stage.find('.jp-pause:visible');
          if ($pause.length) { $pause.first().trigger('click'); self._showMediaStateFeedback('pause'); return; }
          var $play = self.$stage.find('.jp-play:visible, .cv-jp-big-play:visible');
          if ($play.length) { $play.first().trigger('click'); self._showMediaStateFeedback('play'); return; }
          var nativeEl = self.$stage.find('.cv-native-video')[0];
          if (nativeEl) {
            if (nativeEl.paused) { nativeEl.play(); self._showMediaStateFeedback('play'); }
            else { nativeEl.pause(); self._showMediaStateFeedback('pause'); }
          }
          return;
        }
        if (e.key === 'm' && hasBuiltInMedia) {
          e.preventDefault();
          var $unmute = self.$stage.find('.jp-unmute:visible');
          if ($unmute.length) { $unmute.first().trigger('click'); self._showMediaStateFeedback('unmute'); return; }
          var $mute = self.$stage.find('.jp-mute:visible');
          if ($mute.length) { $mute.first().trigger('click'); self._showMediaStateFeedback('mute'); return; }
          var nativeMedia = self.$stage.find('.cv-native-video')[0];
          if (nativeMedia) {
            nativeMedia.muted = !nativeMedia.muted;
            self._showMediaStateFeedback(nativeMedia.muted ? 'mute' : 'unmute');
          }
          return;
        }
        if (e.key === 'd') {
          var $dl = self.$toolbar.find('.cv-tb-download:visible');
          if ($dl.length) { e.preventDefault(); $dl.first().trigger('click'); }
          return;
        }
        if (e.key === 'p') {
          var $pdfPrint = self.$toolbar.find('.cv-tb-pdf-print:visible');
          if ($pdfPrint.length) { e.preventDefault(); $pdfPrint.first().trigger('click'); }
          return;
        }
        if (e.key === 'f') {
          var $fs = self.$fullscreenToggle.filter(':visible');
          if ($fs.length) { e.preventDefault(); $fs.first().trigger('click'); }
          return;
        }
        if (e.key === 't') {
          var $theme = self.$themeToggle.filter(':visible');
          if ($theme.length) { e.preventDefault(); $theme.first().trigger('click'); }
          return;
        }
        if (e.key === 'c') {
          var $carousel = self.$carouselToggle.filter(':visible');
          if ($carousel.length) { e.preventDefault(); $carousel.first().trigger('click'); }
          return;
        }
        if (e.key === 's') {
          var $slide = self.$toolbar.find('.cv-slideshow-btn:visible');
          if ($slide.length) { e.preventDefault(); $slide.first().trigger('click'); }
          return;
        }
        var customKey = (e.key || '').toLowerCase();
        var reserved = { escape: 1, arrowleft: 1, arrowright: 1, ' ': 1, m: 1, r: 1, q: 1, d: 1, p: 1, '?': 1, '+': 1, '-': 1, '=': 1, f: 1, t: 1, c: 1, s: 1 };
        if (!reserved[customKey]) {
          var selKey = customKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          var $customBtn = self.$toolbar.find('.cv-tb-btn[data-cv-shortcut="' + selKey + '"]:visible');
          if ($customBtn.length) { e.preventDefault(); $customBtn.first().trigger('click'); }
        }
      });

      /* zoom slider */
      this.$zoomSlider.on('input', function() {
        if (!self._isImageItem) return;
        var nz = parseFloat(this.value);
        if (self._zoom !== 0) { var r = nz / self._zoom; self._panX *= r; self._panY *= r; }
        self._zoom = nz;
        self._clampPan(); self._applyTransform(); self._fireZoom();
      });
      this.$el.find('.cv-zoom-out-btn').on('click', function() {
        if (!self._isImageItem) return;
        self._setZoom(Math.max(self._zoomOpts().min, self._zoom - 0.25));
      });
      this.$el.find('.cv-zoom-in-btn').on('click', function() {
        if (!self._isImageItem) return;
        self._setZoom(Math.min(self._zoomOpts().max, self._zoom + 0.25));
      });
      this.$zoomPct.on('click', function() { if (self._isImageItem) self._setZoom(1); });

      /* double-click on stage to reset zoom to 100% */
      this.$stageWrap.on('dblclick', function(e) {
        if (!self._isImageItem) return;
        e.preventDefault();
        self._setZoom(1);
      });

      /* wheel zoom */
      this.$stageWrap[0].addEventListener('wheel', function(e) {
        if (!self.visible || !self._isImageItem) return;
        e.preventDefault();
        var zo = self._zoomOpts();
        var delta = e.deltaY < 0 ? zo.wheelStep : -zo.wheelStep;
        var nz = Math.max(zo.min, Math.min(zo.max, self._zoom + delta));
        if (nz === self._zoom) return;
        if (self._isGifItem()) {
          self._panX = 0; self._panY = 0;
        } else {
          var rect = self.$stageWrap[0].getBoundingClientRect();
          var cx = e.clientX - rect.left - rect.width / 2;
          var cy = e.clientY - rect.top  - rect.height / 2;
          var ratio = nz / self._zoom;
          self._panX = cx - ratio * (cx - self._panX);
          self._panY = cy - ratio * (cy - self._panY);
        }
        self._zoom = nz;
        self._clampPan(); self._syncSlider(); self._applyTransform();
      }, { passive: false });

      /* mouse drag pan (disabled for GIF – kept fixed at center) */
      this.$stageWrap.on('mousedown', function(e) {
        if (!self._isImageItem || self._zoom <= 1 || e.button !== 0) return;
        if (self._isGifItem()) return;
        e.preventDefault();
        self._isPanning = true;
        self._panOriginX = e.clientX; self._panOriginY = e.clientY;
        self._panStartX = self._panX; self._panStartY = self._panY;
      });
      $(document).on('mousemove.cv-pan', function(e) {
        if (!self._isPanning) return;
        self._panX = self._panStartX + (e.clientX - self._panOriginX);
        self._panY = self._panStartY + (e.clientY - self._panOriginY);
        self._clampPan(); self._applyTransform();
      });
      $(document).on('mouseup.cv-pan', function() { self._isPanning = false; });

      /* touch pinch + pan */
      this.$stageWrap.on('touchstart', function(e) {
        if (!self._isImageItem) return;
        var t = e.originalEvent.touches;
        if (t.length === 2) {
          e.preventDefault();
          self._isPanning = false;
          self._pinchStartDist = self._touchDist(t); self._pinchStartZoom = self._zoom;
          self._pinchMidX = (t[0].clientX + t[1].clientX) / 2;
          self._pinchMidY = (t[0].clientY + t[1].clientY) / 2;
          self._pinchPanStartX = self._panX; self._pinchPanStartY = self._panY;
        } else if (t.length === 1 && self._zoom > 1 && !self._isGifItem()) {
          self._isPanning = true;
          self._panOriginX = t[0].clientX; self._panOriginY = t[0].clientY;
          self._panStartX = self._panX; self._panStartY = self._panY;
        }
      });
      this.$stageWrap.on('touchmove', function(e) {
        if (!self._isImageItem) return;
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
            self._panX = cx - ratio * (cx - self._panX);
            self._panY = cy - ratio * (cy - self._panY);
          }
          self._zoom = nz;
          self._clampPan(); self._syncSlider(); self._applyTransform();
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
      this.$stageWrap.on('touchend touchcancel', function(e) {
        var rem = e.originalEvent.touches;
        if (rem.length === 1 && self._zoom > 1 && !self._isGifItem()) {
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
          var dx = self._swipeEndX - self._swipeStartX, dy = self._swipeEndY - self._swipeStartY;
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
      this.$stageWrap.on('touchstart', function(e) {
        var t = e.originalEvent.touches;
        if (t.length !== 1 || !self.activeInstance) return;
        var inst = self.activeInstance;
        var canSwipeNav = inst.items.length > 1 && inst.opts.swipeNav !== false && !(self._isImageItem && self._zoom > 1);
        var canSwipeClose = inst.opts.overlayClose && inst.opts.swipeToClose !== false;
        if (!canSwipeNav && !canSwipeClose) return;
        self._swipeStartX = t[0].clientX;
        self._swipeStartY = t[0].clientY;
        self._swipeEndX = self._swipeStartX;
        self._swipeEndY = self._swipeStartY;
        self._swipeTracking = true;
      });
      this.$stageWrap.on('touchmove', function(e) {
        if (!self._swipeTracking || e.originalEvent.touches.length !== 1) return;
        self._swipeEndX = e.originalEvent.touches[0].clientX;
        self._swipeEndY = e.originalEvent.touches[0].clientY;
      });
    },

    _bindTooltip: function() {
      var self = this;
      var $tip = this.$tooltip;
      if (!$tip.length) return;
      var hideTimer;
      function showTip($target) {
        var text = $target.attr('data-cv-tooltip');
        if (!text) return;
        clearTimeout(hideTimer);
        $tip.text(text).attr('aria-hidden', 'false').addClass('cv-tooltip-visible');
        var rect = $target[0].getBoundingClientRect();
        var tipRect = $tip[0].getBoundingClientRect();
        var left = rect.left + (rect.width / 2) - (tipRect.width / 2);
        var top = rect.top - tipRect.height - 6;
        if (top < 8) top = rect.bottom + 6;
        $tip.css({ left: left + 'px', top: top + 'px' });
      }
      function hideTip() {
        hideTimer = setTimeout(function() {
          $tip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true');
        }, 50);
      }
      this.$el.on('mouseenter.cv-tooltip', '[data-cv-tooltip]', function(e) {
        showTip($(e.currentTarget));
      });
      this.$el.on('mouseleave.cv-tooltip', '[data-cv-tooltip]', function(e) {
        hideTip();
      });
      this.$el.on('mouseenter.cv-tooltip', '.cv-tooltip', function() { clearTimeout(hideTimer); });
      this.$el.on('mouseleave.cv-tooltip', '.cv-tooltip', hideTip);
    },

    _applyTooltips: function(inst) {
      if (!inst || !this.$el.length) return;
      var show = inst.opts.canShowTooltip !== false;
      var set = function($el, key) {
        if (show) {
          var text = str(inst, key);
          $el.attr('data-cv-tooltip', text);
        } else {
          $el.removeAttr('data-cv-tooltip');
        }
      };
      set(this.$el.find('.cv-close'), 'close');
      set(this.$carouselToggle, 'attachments');
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      set(this.$fullscreenToggle, (fsEl === this.$el[0]) ? 'exitFullscreen' : 'fullscreen');
      set(this.$themeToggle, (inst.opts.theme || 'dark') === 'dark' ? 'switchToLightMode' : 'switchToDarkMode');
      set(this.$prev, 'previousItem');
      set(this.$next, 'nextItem');
      set(this.$carouselPrev, 'scrollCarouselLeft');
      set(this.$carouselNext, 'scrollCarouselRight');
      set(this.$el.find('.cv-zoom-out-btn'), 'zoomOut');
      set(this.$zoomSlider, 'zoomLevel');
      set(this.$el.find('.cv-zoom-in-btn'), 'zoomIn');
    },

    _nav: function(dir, useTransition) {
      if (!this.activeInstance) return;
      var opts = useTransition ? { transition: true } : undefined;
      if (dir === 'prev') this.activeInstance.prev(opts); else this.activeInstance.next(opts);
    },

    /* ── zoom helpers ──────────────────────────────────────────── */
    _zoomOpts: function() { return (this.activeInstance && this.activeInstance.opts.zoom) || DEFAULTS.zoom; },
    _isGifItem: function() {
      var inst = this.activeInstance;
      if (!inst || !inst.items || inst.idx < 0) return false;
      var item = inst.items[inst.idx];
      return (item.type || 'image') === 'image' && item.src && /\.gif$/i.test(item.src);
    },
    _setZoom: function(val) {
      var zo = this._zoomOpts();
      var nz = Math.max(zo.min, Math.min(zo.max, val));
      if (nz !== this._zoom) { var r = nz / this._zoom; this._panX *= r; this._panY *= r; }
      this._zoom = nz; this._clampPan(); this._syncSlider(); this._applyTransform();
    },
    _syncSlider: function() {
      var z = Number(this._zoom);
      this.$zoomSlider.val(z);
      var pct = Math.round(z * 100);
      this.$zoomPct.text(pct + '%');
      this._fireZoom();
    },
    _fireZoom: function() {
      var inst = this.activeInstance;
      if (!inst) return;
      var cb = inst.opts.zoom && inst.opts.zoom.onZoom;
      if (typeof cb === 'function') {
        cb(this._zoom, inst.items[inst.idx], inst);
      }
    },
    _applyTransform: function() {
      var $img = this.$stage.find('.cv-image');
      if (!$img.length) return;
      /* Center at stage (50%,50%), then pan, then scale from center so image/GIF stays fixed at center */
      $img.css('transform', 'translate(-50%, -50%) translate(' + this._panX + 'px,' + this._panY + 'px) scale(' + this._zoom + ')');
      $img.css('cursor', (this._zoom > 1 && !this._isGifItem()) ? 'grab' : '');
    },
    _clampPan: function() {
      /* GIF: keep fixed at center – no pan, zoom only; static images can pan */
      if (this._isGifItem()) { this._panX = 0; this._panY = 0; return; }
      if (this._zoom <= 1) { this._panX = 0; this._panY = 0; return; }
      var stage = this.$stageWrap[0];
      var img = this.$stage.find('.cv-image')[0];
      if (!stage) return;
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
    _resetZoomPan: function() {
      this._zoom = 1; this._panX = 0; this._panY = 0;
      this._isPanning = false; this._pinchStartDist = 0; this._justEndedPinch = false;
      this._syncSlider();
    },
    _touchDist: function(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    /* ── open / close ──────────────────────────────────────────── */
    open: function(instance) {
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
        this.$carouselToggle.attr('aria-expanded', 'false');
        this._updateCarouselNavVisibility(instance);
      } else {
        this.$carouselToggle.hide();
        this.$carouselWrap.removeClass('cv-open');
      }
      this.$fullscreenToggle.toggle(instance.opts.fullscreen !== false);
      this._syncFullscreenToggle();
      this._applyTooltips(instance);
      if (this._stageOnlyEnabled(instance)) this.$shell.addClass('cv-stage-only'); else this.$shell.removeClass('cv-stage-only');
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
      this.loadItem();
      if (instance.opts.wcag) {
        var self = this;
        setTimeout(function() {
          var el;
          if (self._stageOnlyEnabled(instance) && !self._stageOnlyHideNav(instance)) {
            el = self.$prev.is(':visible') ? self.$prev[0] : self.$next[0];
          } else if (!self._stageOnlyEnabled(instance)) {
            el = self.$el.find('.cv-close')[0];
          } else {
            el = self.$el.find('.cv-close')[0] || self.$stage[0];
          }
          if (el) el.focus();
        }, 0);
      }
    },

    _updateNavButtons: function(inst) {
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
    _preloadAdjacentImages: function(inst) {
      if (!inst || !inst.items.length || inst.opts.preloadAdjacentImages === false) return;
      var n = inst.items.length;
      var nextIdx = inst.opts.loop ? (inst.idx + 1) % n : (inst.idx + 1 < n ? inst.idx + 1 : -1);
      var prevIdx = inst.opts.loop ? (inst.idx - 1 + n) % n : (inst.idx - 1 >= 0 ? inst.idx - 1 : -1);
      var preload = function(item) {
        if (!item || (item.type || 'image') !== 'image') return;
        var src = item.src;
        if (!src || !isSafeResourceUrl(src)) return;
        var img = new Image();
        img.src = src;
      };
      if (nextIdx >= 0) preload(inst.items[nextIdx]);
      if (prevIdx >= 0 && prevIdx !== nextIdx) preload(inst.items[prevIdx]);
    },

    /**
     * Build the carousel strip of thumbnails for all items. Clicking a thumb calls goTo(index).
     * Video/audio show thumbnailUrl with a play icon overlay.
     */
    _carouselEnabled: function(inst) {
      if (!inst) return false;
      var c = inst.opts.carousel;
      return !!(c && c.enabled);
    },
    _carouselNavThreshold: function(inst) {
      if (!inst) return 4;
      var c = inst.opts.carousel;
      return (c && c.navThreshold != null) ? c.navThreshold : 4;
    },
    _stageOnlyEnabled: function(inst) {
      if (!inst || !inst.opts.stageOnly) return false;
      var so = inst.opts.stageOnly;
      return so === true || (so && so.enabled === true);
    },
    _stageOnlyHideNav: function(inst) {
      if (!inst || !inst.opts.stageOnly || typeof inst.opts.stageOnly !== 'object') return false;
      return inst.opts.stageOnly.hideNavigation === true;
    },
    _buildCarousel: function(inst) {
      var self = this;
      this.$carousel.empty();
      var items = inst.items;
      var truncate = function(s, maxLen) {
        if (s == null || s === '') return '';
        var str = String(s).trim();
        if (str.length <= maxLen) return str;
        return str.slice(0, maxLen - 1) + '…';
      };
      for (var i = 0; i < items.length; i++) {
        (function(idx) {
          var item = items[idx];
          var type = item.type || 'image';
          var thumbSrc = null;
          if (type === 'image' && item.src && isSafeResourceUrl(item.src)) {
            thumbSrc = (item.thumbnailUrl && isSafeResourceUrl(item.thumbnailUrl)) ? item.thumbnailUrl : item.src;
          } else if ((type === 'video' || type === 'audio') && item.thumbnailUrl && isSafeResourceUrl(item.thumbnailUrl)) {
            thumbSrc = item.thumbnailUrl;
          }
          var typeLabel = type === 'pdf' ? 'PDF' : type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : type === 'inline' ? 'Code' : type === 'markdown' ? 'MD' : type === 'html' ? 'HTML' : type === 'error' ? '—' : (item.fileExt || type).slice(0, 4);
          var title = (item.title != null && item.title !== '') ? String(item.title).trim() : '';
          var $item = $('<button type="button" class="cv-carousel-item" data-cv-index="' + idx + '"></button>');
          if (thumbSrc) {
            var $img = $('<img class="cv-carousel-thumb" alt="">').attr('src', thumbSrc);
            $img.on('error', function() { $item.addClass('cv-carousel-no-thumb'); });
            $item.append($img);
            if (type === 'video' || type === 'audio') {
              $item.append($('<span class="cv-carousel-play-icon">' + Icons.play + '</span>'));
            }
          } else {
            $item.addClass('cv-carousel-no-thumb').text(title ? truncate(title, 12) : typeLabel);
          }
          if (title) $item.attr('title', title);
          if (inst.opts.wcag) $item.attr('aria-label', str(inst, 'carouselItemLabel').replace('%1', String(idx + 1)).replace('%2', String(inst.items.length)));
          $item.on('click', function(e) {
            e.preventDefault();
            if (inst !== self.activeInstance) return;
            if (idx === inst.idx) return;
            inst.goTo(idx);
          });
          self.$carousel.append($item);
        })(i);
      }
      this._updateCarouselSelection(inst);
      this._updateCarouselNavVisibility(inst);
    },

    _updateCarouselNavVisibility: function(inst) {
      if (!inst || !this._carouselEnabled(inst)) return;
      var threshold = this._carouselNavThreshold(inst);
      var showNav = inst.items.length > threshold;
      this.$carouselPrev.toggle(showNav);
      this.$carouselNext.toggle(showNav);
    },

    _updateCarouselSelection: function(inst) {
      if (!inst || !this._carouselEnabled(inst)) return;
      this.$carousel.find('.cv-carousel-item').removeClass('cv-active').attr('aria-current', null);
      var $current = this.$carousel.find('.cv-carousel-item[data-cv-index="' + inst.idx + '"]');
      $current.addClass('cv-active').attr('aria-current', 'true');
      var el = $current[0];
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    },

    _syncThemeToggle: function() {
      var inst = this.activeInstance;
      if (!inst) return;
      var theme = inst.opts.theme || 'dark';
      var label = str(inst, theme === 'dark' ? 'switchToLightMode' : 'switchToDarkMode');
      if (inst.opts.wcag) this.$themeToggle.attr('aria-label', label);
      this.$themeToggle.html(theme === 'dark' ? Icons.themeLight : Icons.themeDark);
      this._applyTooltips(inst);
    },

    _syncFullscreenToggle: function() {
      var el = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      var isOverlayFullscreen = (el === this.$el[0]);
      var inst = this.activeInstance;
      var key = isOverlayFullscreen ? 'exitFullscreen' : 'fullscreen';
      var label = inst ? str(inst, key) : (isOverlayFullscreen ? 'Exit fullscreen' : 'Fullscreen');
      if (inst && inst.opts.wcag) this.$fullscreenToggle.attr('aria-label', label);
      this.$fullscreenToggle.html(isOverlayFullscreen ? Icons.fullscreenExit : Icons.fullscreen);
      if (inst && inst.opts.canShowTooltip !== false) this.$fullscreenToggle.attr('data-cv-tooltip', label);
      else if (inst) this.$fullscreenToggle.removeAttr('data-cv-tooltip');
      if (inst) this._applyTooltips(inst);
      /* Move tooltip into overlay when fullscreen so it appears above fullscreen content; move back to body when exiting */
      if (this.$tooltip && this.$tooltip.length) {
        if (isOverlayFullscreen && this.$tooltip.parent()[0] !== this.$el[0]) this.$el.append(this.$tooltip);
        else if (!isOverlayFullscreen && this.$tooltip.parent()[0] !== document.body) $('body').append(this.$tooltip);
      }
    },

    _toggleOverlayFullscreen: function() {
      var el = this.$el[0];
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      var isOurs = (fsEl === el);
      var self = this;
      if (fsEl && isOurs) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
        setTimeout(function() { self._syncFullscreenToggle(); }, 50);
      } else {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
        setTimeout(function() { self._syncFullscreenToggle(); }, 100);
      }
    },

    close: function() {
      if (this.$tooltip && this.$tooltip.length) this.$tooltip.removeClass('cv-tooltip-visible').attr('aria-hidden', 'true');
      this._hideShortcutsPopup();
      if (!this.activeInstance) {
        if (this._bodyOverflow != null) {
          document.body.style.overflow = this._bodyOverflow;
          this._bodyOverflow = null;
        }
        return;
      }
      var inst = this.activeInstance, item = inst.items[inst.idx];
      var hadWcag = inst.opts.wcag;
      if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
      if (fsEl === this.$el[0]) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      }
      var self = this;
      this.$el.addClass('cv-closing');
      if (typeof inst.opts.onCleanup === 'function' && item) inst.opts.onCleanup(item, inst);
      setTimeout(function() {
        self._destroyCurrent(inst);
        if (typeof inst.opts.onClose === 'function' && item) inst.opts.onClose(item, inst);
        self.$el.removeClass('cv-visible cv-closing');
        document.body.style.overflow = self._bodyOverflow != null ? self._bodyOverflow : '';
        self._bodyOverflow = null;
        if (hadWcag) self.$el[0].setAttribute('aria-hidden', 'true');
        if (hadWcag) {
          if (self.$title[0]) self.$title[0].removeAttribute('aria-live');
          if (self.$counter[0]) self.$counter[0].removeAttribute('aria-live');
        }
        self.$stage.empty(); self.$loader.removeClass('cv-active');
        self._resetZoomPan();
        self._swipeTracking = false;
        self.visible = false; self.activeInstance = null;
        if (hadWcag && self._focusBeforeOpen && typeof self._focusBeforeOpen.focus === 'function') {
          self._focusBeforeOpen.focus();
        }
        self._focusBeforeOpen = null;
      }, 300);
    },

    /* ── core: load item ───────────────────────────────────────── */
    loadItem: function(opts) {
      var inst = this.activeInstance;
      if (!inst) return;
      var item = inst.items[inst.idx];
      if (!item) return;
      opts = opts || {};
      var useTransition = opts.transition && this.$stage.children().length > 0;
      if (useTransition) {
        var self = this;
        this.$stageWrap.addClass('cv-stage-out');
        setTimeout(function() {
          self.$stageWrap.removeClass('cv-stage-out');
          self._loadItemCore(inst, true);
        }, 280);
        return;
      }
      this._loadItemCore(inst, false);
    },

    _loadItemCore: function(inst, fadeIn) {
      var item = inst.items[inst.idx];
      if (!item) return;

      if (typeof inst.opts.onLoading === 'function') inst.opts.onLoading(item, inst);

      this._destroyCurrent(inst);
      this.$stage.empty(); this.$loader.removeClass('cv-active');
      this._resetZoomPan();

      /* Use .text() so item.title (fileName) is never interpreted as HTML — XSS-safe */
      this.$title.text(item.title != null && item.title !== '' ? String(item.title) : '');
      this.$counter.text((inst.idx + 1) + ' / ' + inst.items.length);
      var type = item.type || 'image';
      /* For type html: hide title/counter when no title given */
      if (type === 'html') {
        var hasTitle = (item.title != null && item.title !== '');
        this.$title.closest('.cv-header-center').toggle(hasTitle);
        this.$counter.closest('.cv-header-left').toggle(hasTitle);
      } else {
        this.$title.closest('.cv-header-center').show();
        this.$counter.closest('.cv-header-left').show();
      }
      if (inst.opts.showCounter === false) this.$counter.closest('.cv-header-left').hide();

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
          result = builtInInlineRenderer(item, this.$stage);
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

      /* 4. Light-stage class so nav arrows are visible in dark mode (inline/markdown have white bg) */
      if (type === 'inline' || type === 'markdown') {
        this.$shell.addClass('cv-stage-light-bg');
      } else {
        this.$shell.removeClass('cv-stage-light-bg');
      }

      inst._currentResult = result || {};

      /* 5. Resolve toolbar */
      this._resolveToolbar(inst, result || {});

      /* 6. Poll option (above toolbar) */
      this._updatePollOption(inst, item);

      /* 7. Footer visible if toolbar/zoom or poll option row is shown (not for image error) */
      if (this.$pollOption.hasClass('cv-active') && !(result && result.imageError)) this.$footer.show();

      /* 8. Update prev/next visibility (when loop: false, hide at first/last) */
      this._updateNavButtons(inst);

      /* 9. Preload adjacent images so next/prev to image shows instantly */
      this._preloadAdjacentImages(inst);

      /* 10. Update carousel active state */
      this._updateCarouselSelection(inst);

      /* 11. onOpen */
      if (typeof inst.opts.onOpen === 'function') inst.opts.onOpen(item, this.$stage, inst);

      /* 11b. onComplete — after content is displayed (sync when no fade, or after fade-in) */
      if (!fadeIn && typeof inst.opts.onComplete === 'function') inst.opts.onComplete(item, inst);

      /* 12. Slideshow — only run when not paused by user */
      if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
      var ss = inst.opts.slideshow;
      if (ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying)) {
        var intervalMs = (ss.interval != null && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
        var advanceMedia = ss.advanceMedia === 'onEnd' ? 'onEnd' : 'interval';
        inst._slideshowPlaying = true;
        if (advanceMedia === 'onEnd') {
          var $media = this.$stage.find('video, audio');
          if ($media.length) {
            $media.one('ended', function() {
              if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
              if (Overlay.activeInstance === inst) inst.next({ transition: true });
            });
            inst._slideshowTimer = setTimeout(function() {
              if (Overlay.activeInstance === inst) inst.next({ transition: true });
            }, intervalMs);
          } else {
            inst._slideshowTimer = setTimeout(function() { if (Overlay.activeInstance === inst) inst.next({ transition: true }); }, intervalMs);
          }
        } else {
          inst._slideshowTimer = setTimeout(function() { if (Overlay.activeInstance === inst) inst.next({ transition: true }); }, intervalMs);
        }
        if (ss.showProgress) this._startSlideshowProgress(intervalMs);
        var $slideBtn = this.$toolbar.find('.cv-slideshow-btn');
        if ($slideBtn.length) {
          $slideBtn.find('.cv-tb-label').text(str(inst, 'pauseSlideshow'));
          if (inst.opts.canShowTooltip !== false) $slideBtn.attr('data-cv-tooltip', str(inst, 'pauseSlideshow'));
        }
      } else {
        this._stopSlideshowProgress();
      }

      if (fadeIn && this.$stage.children().length > 0) {
        var self = this;
        this.$stage.addClass('cv-stage-in');
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            self.$stage.addClass('cv-stage-in-visible');
            setTimeout(function() {
              self.$stage.removeClass('cv-stage-in cv-stage-in-visible');
              if (typeof inst.opts.onComplete === 'function') inst.opts.onComplete(item, inst);
            }, 320);
          });
        });
      }
    },

    _destroyCurrent: function(inst) {
      if (inst._currentResult && typeof inst._currentResult.destroy === 'function') {
        inst._currentResult.destroy();
      }
      inst._currentResult = null;
    },

    _startSlideshowProgress: function(intervalMs) {
      if (!this.$slideshowProgressWrap || !this.$slideshowProgressBar.length) return;
      this.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
      this.$slideshowProgressWrap.show();
      var bar = this.$slideshowProgressBar[0];
      if (bar) bar.offsetHeight;
      this.$slideshowProgressBar.css({ transition: 'width ' + intervalMs + 'ms linear', width: '100%' });
    },
    _stopSlideshowProgress: function() {
      if (!this.$slideshowProgressWrap || !this.$slideshowProgressBar.length) return;
      this.$slideshowProgressWrap.hide();
      this.$slideshowProgressBar.css({ transition: 'none', width: '0%' });
    },

    /** Returns a single toolbar item config for the slideshow Play/Pause button. Used when footer would otherwise be hidden (HTML, stageOnly) or in the main toolbar. */
    _slideshowButtonItem: function(inst) {
      var self = this;
      var ss = inst.opts.slideshow;
      if (!ss || !ss.enabled || !inst.items || inst.items.length < 2) return null;
      if (ss.autoStart === true && ss.hideSlideshowButton === true) return null;
      var running = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
      var intervalMs = (ss.interval != null && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
      return {
        id: 'slideshow',
        className: 'cv-slideshow-btn',
        showLabel: true,
        label: running ? str(inst, 'pauseSlideshow') : str(inst, 'playSlideshow'),
        onClick: function() {
          var r = !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying);
          var $btn = self.$toolbar.find('.cv-slideshow-btn');
          if (r) {
            inst._slideshowPaused = true;
            if (inst._slideshowTimer) { clearTimeout(inst._slideshowTimer); inst._slideshowTimer = null; }
            self._stopSlideshowProgress();
            $btn.find('.cv-tb-label').text(str(inst, 'playSlideshow'));
            if (inst.opts.canShowTooltip !== false) $btn.attr('data-cv-tooltip', str(inst, 'playSlideshow'));
          } else {
            inst._slideshowPaused = false;
            inst._slideshowPlaying = true;
            inst._slideshowTimer = setTimeout(function() { if (Overlay.activeInstance === inst) inst.next({ transition: true }); }, intervalMs);
            if (ss.showProgress) self._startSlideshowProgress(intervalMs);
            $btn.find('.cv-tb-label').text(str(inst, 'pauseSlideshow'));
            if (inst.opts.canShowTooltip !== false) $btn.attr('data-cv-tooltip', str(inst, 'pauseSlideshow'));
          }
        }
      };
    },

    /* ── toolbar resolution ────────────────────────────────────── */
    _resolveToolbar: function(inst, result) {
      if (this._isHtmlItem) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        var slideBtn = this._slideshowButtonItem(inst);
        if (slideBtn) {
          this._buildToolbar(inst, [slideBtn], false);
          this.$footer.show();
        } else {
          this._buildToolbar(inst, [], false);
          this.$footer.hide();
        }
        return;
      }
      if (result && result.imageError) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [], false);
        this.$footer.hide();
        return;
      }
      var slideBtn;
      if (this._stageOnlyEnabled(inst) && (slideBtn = this._slideshowButtonItem(inst))) {
        this.$zoomWidget.hide();
        this.$zoomPct.hide();
        this._buildToolbar(inst, [slideBtn], false);
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
      var showPct = !!(zoomOpts.showPercentage);
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
          if (items.length) items.push('separator');
          items = items.concat(userItems);
        }

        /* Slideshow Play/Pause button when slideshow enabled and more than one item (button first, then separator) */
        var slideBtn = this._slideshowButtonItem(inst);
        if (slideBtn) {
          if (items.length > 0) items.unshift('separator');
          items.unshift(slideBtn);
        }

        /* onToolbar callback — let customer modify */
        if (typeof inst.opts.onToolbar === 'function') {
          var modified = inst.opts.onToolbar(inst.items[inst.idx], items.slice(), inst);
          if ($.isArray(modified)) items = modified;
        }

        this._buildToolbar(inst, items, tbOpts.download !== false);
      }

      var hasContent = this.$toolbar.children().length > 0 || showZoom;
      this.$footer.toggle(hasContent);
    },

    _updatePollOption: function(inst, item) {
      var opts = inst.opts.pollOption;
      this.$pollOption.removeClass('cv-active').empty();
      if (this._isHtmlItem) return;
      if (!opts || !opts.enabled || item.pollOptionLabel == null || String(item.pollOptionLabel).trim() === '') return;

      var mode = (opts.mode === 'checkbox') ? 'checkbox' : 'radio';
      var value = (item.pollOptionId != null) ? String(item.pollOptionId) : ('idx-' + inst.idx);

      if (mode === 'radio') {
        if (inst._pollSelectedValue === undefined) inst._pollSelectedValue = null;
      } else {
        if (!inst._pollSelectedSet) inst._pollSelectedSet = new Set();
      }

      var isChecked = mode === 'radio'
        ? (inst._pollSelectedValue === value)
        : inst._pollSelectedSet.has(value);

      var radioName = 'cv-poll-' + inst.id;
      var inputId = 'cv-poll-input-' + inst.id + '-' + value.replace(/[^a-z0-9-]/gi, '-');
      var inputHtml = mode === 'radio'
        ? '<input type="radio" name="' + escHtml(radioName) + '" value="' + escHtml(value) + '" id="' + escHtml(inputId) + '"' + (isChecked ? ' checked' : '') + '>'
        : '<input type="checkbox" id="' + escHtml(inputId) + '" value="' + escHtml(value) + '"' + (isChecked ? ' checked' : '') + '>';

      var $wrap = $(
        '<div class="cv-poll-option-inner">' +
          '<label class="cv-poll-option-label-wrap">' + inputHtml +
          '<span class="cv-poll-option-label">' + escHtml(String(item.pollOptionLabel)) + '</span></label>' +
        '</div>'
      );
      this.$pollOption.append($wrap).addClass('cv-active');

      $wrap.find('input').on('change', function() {
        var checked = this.checked;
        if (mode === 'radio') {
          inst._pollSelectedValue = checked ? value : null;
        } else {
          if (checked) inst._pollSelectedSet.add(value); else inst._pollSelectedSet.delete(value);
        }
        if (typeof opts.onSelect === 'function') opts.onSelect(item, checked, inst);
      });
    },

    _buildToolbar: function(inst, items, showDownload) {
      var $tb = this.$toolbar;
      $tb.empty();
      this._resolvedToolbarItems = items || [];

      this._renderToolbarItems($tb, items, inst);

      if (showDownload) {
        if ($tb.children().length > 0) $tb.append('<span class="cv-tb-sep"></span>');
        var dlTitle = (inst.opts.canShowTooltip !== false) ? (' data-cv-tooltip="' + escHtml(str(inst, 'download')) + '"') : '';
        var $dl = $('<button class="cv-tb-btn cv-tb-download" type="button"' + dlTitle + '>' + Icons.download + '</button>');
        $dl.on('click', function(e) {
          e.preventDefault();
          var ci = inst.items[inst.idx];
          if (typeof inst.opts.onDownload === 'function') {
            inst.opts.onDownload(ci, inst);
          } else {
            var url = ci.downloadUrl || ci.src;
            if (!url || !isSafeDownloadUrl(url)) return;
            var a = document.createElement('a');
            a.href = url; a.download = safeDownloadFilename(ci.title); a.target = '_blank';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }
        });
        $tb.append($dl);
      }
    },

    _getShortcutsList: function(inst) {
      var list = [];
      if (!inst || !inst.opts.keyboardNav) return list;
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
      if (this.$toolbar.find('.cv-tb-pdf-print').length && this.$toolbar.find('.cv-tb-pdf-print').is(':visible')) {
        list.push({ key: 'p', label: str(inst, 'print') });
      }
      var hasBuiltInMedia = !this._isCustomRendered && this.$stage.find('.jp-play, .jp-pause, .jp-mute, .jp-unmute, .cv-native-video, .cv-native-audio').length > 0;
      if (hasBuiltInMedia) {
        list.push({ key: ' ', label: str(inst, 'playPause') });
        list.push({ key: 'm', label: str(inst, 'muteUnmute') });
      }
      if (this.$toolbar.find('.cv-tb-download').length && this.$toolbar.find('.cv-tb-download').is(':visible')) {
        list.push({ key: 'd', label: str(inst, 'download') });
      }
      if (opts.fullscreen !== false && this.$fullscreenToggle.length && this.$fullscreenToggle.is(':visible')) {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
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
      var reservedKeys = { escape: 1, arrowleft: 1, arrowright: 1, ' ': 1, m: 1, r: 1, q: 1, d: 1, p: 1, '?': 1, '+': 1, '-': 1, '=': 1, f: 1, t: 1, c: 1, s: 1 };
      var items = this._resolvedToolbarItems || [];
      for (var i = 0; i < items.length; i++) {
        var tbItem = items[i];
        if (tbItem === 'separator' || tbItem === '-' || tbItem instanceof HTMLElement || tbItem instanceof $) continue;
        if (!tbItem.shortcutKey) continue;
        var isVisible = true;
        if (typeof tbItem.visible === 'function') isVisible = tbItem.visible(currentItem, inst);
        else if (tbItem.visible === false) isVisible = false;
        if (!isVisible) continue;
        var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
        if (sk && !reservedKeys[sk]) list.push({ key: sk, label: tbItem.label || (tbItem.id ? String(tbItem.id) : sk) });
      }
      if (opts.shortcutsPopup !== false) {
        list.push({ key: '?', label: str(inst, 'showShortcuts') });
      }
      return list;
    },

    _showMediaStateFeedback: function(type) {
      var $wrap = this.$stage.find('.cv-video-wrap').first();
      if (!$wrap.length) return;
      $wrap.find('.cv-jp-state-feedback').remove();
      var svg = '';
      if (type === 'play') svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
      else if (type === 'pause') svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      else if (type === 'mute') svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      else if (type === 'unmute') svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
      else return;
      var $el = $('<div class="cv-jp-state-feedback">' + svg + '</div>');
      $wrap.append($el);
      var t1 = setTimeout(function() {
        $el.addClass('cv-jp-state-feedback-out');
      }, 900);
      var t2 = setTimeout(function() {
        clearTimeout(t1);
        $el.remove();
      }, 1300);
    },

    _shortcutKeyDisplay: function(key) {
      if (key === ' ') return 'Space';
      if (key === 'Escape') return 'Esc';
      if (key === 'ArrowLeft') return '←';
      if (key === 'ArrowRight') return '→';
      return key.length === 1 ? key.toUpperCase() : key;
    },

    _showShortcutsPopup: function() {
      var self = this;
      var inst = this.activeInstance;
      if (!inst) return;
      this._focusBeforeShortcutsPopup = document.activeElement;
      var list = this._getShortcutsList(inst);
      var title = str(inst, 'keyboardShortcuts');
      var useWcag = !!inst.opts.wcag;
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
        if ($closeBtn.length) $closeBtn.on('click', function() { self._hideShortcutsPopup(); });
      }
      this.$shortcutsPopup.off('click.cv-shortcuts').on('click.cv-shortcuts', function(e) {
        if (e.target === self.$shortcutsPopup[0] || $(e.target).closest('.cv-shortcuts-popup-inner').length === 0) self._hideShortcutsPopup();
      });
      if (useWcag) {
        var $focusTarget = this.$shortcutsPopup.find('.cv-shortcuts-popup-close');
        if ($focusTarget.length) $focusTarget[0].focus();
        else this.$shortcutsPopup.find('.cv-shortcuts-popup-inner')[0].focus();
      }
      if (inst._slideshowTimer) {
        clearTimeout(inst._slideshowTimer);
        inst._slideshowTimer = null;
        inst._slideshowHeldByShortcutsPopup = true;
        this._stopSlideshowProgress();
      }
    },

    _hideShortcutsPopup: function() {
      var hadFocus = this._focusBeforeShortcutsPopup;
      this.$shortcutsPopup.removeClass('cv-open').attr('aria-hidden', 'true').removeAttr('aria-modal').empty();
      this._focusBeforeShortcutsPopup = null;
      if (hadFocus && typeof hadFocus.focus === 'function') {
        try { hadFocus.focus(); } catch (err) {}
      }
      var inst = this.activeInstance;
      if (inst && inst._slideshowHeldByShortcutsPopup) {
        inst._slideshowHeldByShortcutsPopup = false;
        var ss = inst.opts.slideshow;
        if (ss && ss.enabled && inst.items.length > 1 && !inst._slideshowPaused && (ss.autoStart !== false || inst._slideshowPlaying)) {
          var intervalMs = (ss.interval != null && ss.interval > 0 ? ss.interval : SLIDESHOW_DEFAULT_INTERVAL) * 1000;
          inst._slideshowTimer = setTimeout(function() {
            if (Overlay.activeInstance === inst) inst.next({ transition: true });
          }, intervalMs);
          if (ss.showProgress) this._startSlideshowProgress(intervalMs);
        }
      }
    },

    _renderToolbarItems: function($tb, items, inst) {
      if (!items || !items.length) return;
      var currentItem = inst.items[inst.idx];

      for (var i = 0; i < items.length; i++) {
        var tbItem = items[i];
        if (tbItem === 'separator' || tbItem === '-') { $tb.append('<span class="cv-tb-sep"></span>'); continue; }
        if (tbItem instanceof HTMLElement || tbItem instanceof $) { $tb.append(tbItem); continue; }

        var isVisible = true;
        if (typeof tbItem.visible === 'function') isVisible = tbItem.visible(currentItem, inst);
        else if (tbItem.visible === false) isVisible = false;
        if (!isVisible) continue;

        var iconHtml = '';
        if (tbItem.icon) {
          if (tbItem.icon.charAt(0) === '<') {
            iconHtml = sanitizeIconHtml(tbItem.icon);
          } else {
            iconHtml = '<i class="' + escHtml(tbItem.icon) + '"></i>';
          }
        }
        var label = tbItem.label || '';
        var tooltipText = (tbItem.tooltip != null && tbItem.tooltip !== '') ? String(tbItem.tooltip) : label;
        var showTooltip = inst.opts.canShowTooltip !== false && tooltipText !== '';
        var ariaLabel = (tooltipText || (tbItem.id ? String(tbItem.id) : '')) && inst.opts.wcag ? ' aria-label="' + escHtml(tooltipText || tbItem.id || '') + '"' : '';
        var dataTooltip = showTooltip ? ' data-cv-tooltip="' + escHtml(tooltipText) + '"' : '';
        var btnHtml = iconHtml;
        if (tbItem.showLabel && label) btnHtml += ' <span class="cv-tb-label">' + escHtml(label) + '</span>';

        var shortcutAttr = '';
        if (tbItem.shortcutKey != null && String(tbItem.shortcutKey).trim() !== '') {
          var sk = String(tbItem.shortcutKey).toLowerCase().charAt(0);
          if (sk) shortcutAttr = ' data-cv-shortcut="' + escHtml(sk) + '"';
        }
        var $btn = $(
          '<button class="cv-tb-btn' +
            (tbItem.id ? ' cv-tb-' + escHtml(String(tbItem.id)) : '') +
            (tbItem.className ? ' ' + escHtml(String(tbItem.className)) : '') +
          '" type="button"' + shortcutAttr + dataTooltip + ariaLabel + '>' + btnHtml + '</button>'
        );
        if (typeof tbItem.onClick === 'function') {
          (function(fn) {
            $btn.on('click', function(e) { e.preventDefault(); fn(inst.items[inst.idx], inst); });
          })(tbItem.onClick);
        }
        $tb.append($btn);
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: IMAGE
     ═══════════════════════════════════════════════════════════════════ */

  function builtInImageRenderer(item, $stage) {
    if (!item.src || !isSafeResourceUrl(item.src)) {
      builtInErrorCard($stage, 'Invalid or unsafe image URL', item, { noDownload: true });
      return { imageError: true };
    }
    var inst = Overlay.activeInstance;
    var hasValidDownloadUrl = (item.downloadUrl || item.src) && isSafeDownloadUrl(item.downloadUrl || item.src);
    var $wrap = $('<div class="cv-img-wrap"></div>');
    Overlay.$loader.addClass('cv-active');
    var altText = (item.title != null && String(item.title).trim() !== '') ? String(item.title) : '';
    var $img = $('<img class="cv-image" alt="' + escHtml(altText) + '" />');
    var img = new Image();
    img.onload = function() {
      Overlay.$loader.removeClass('cv-active');
      $img.attr('src', item.src).attr('alt', altText).addClass('cv-loaded');
      Overlay._clampPan();
      Overlay._applyTransform();
    };
    img.onerror = function() {
      Overlay.$loader.removeClass('cv-active');
      $wrap.remove();
      $stage.empty();
      builtInErrorCard($stage, 'Image could not be loaded', item, { noDownload: !hasValidDownloadUrl });
      if (inst) Overlay._resolveToolbar(inst, { imageError: true });
    };
    img.src = item.src;
    $wrap.append($img);
    $stage.append($wrap);
    return {};
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: VIDEO (jPlayer)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInVideoNativeRenderer(item, $stage) {
    if (!isSafeResourceUrl(item.src)) return null;
    var $wrap = $('<div class="cv-video-wrap"></div>');
    var poster = (item.thumbnailUrl && isSafeResourceUrl(item.thumbnailUrl)) ? item.thumbnailUrl : '';
    var $video = $('<video class="cv-native-video" controls playsinline preload="metadata"></video>');
    $video.attr('src', item.src);
    if (poster) $video.attr('poster', poster);
    $wrap.append($video);
    $stage.append($wrap);
    return {};
  }

  function builtInVideoRenderer(item, $stage, inst) {
    if (typeof $.fn.jPlayer === 'undefined') return builtInVideoNativeRenderer(item, $stage);
    if (!isSafeResourceUrl(item.src)) return null;

    var id = 'cv-jp-v-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = getMediaSupplied(item, inst);
    var media = {}; media[supplied] = item.src;
    if (item.thumbnailUrl && isSafeResourceUrl(item.thumbnailUrl)) media.poster = item.thumbnailUrl;

    var vTip = (inst && inst.opts.canShowTooltip !== false);
    var v = function(k) { return vTip ? (' data-cv-tooltip="' + escHtml(str(inst, k)) + '"') : ''; };
    var $wrap = $(
      '<div class="cv-video-wrap">' +
        '<div id="' + id + '" class="cv-jp-player"></div>' +
        '<div id="' + containerId + '" class="cv-jp-video-ui">' +
          '<div class="cv-jp-video-screen"></div>' +
          '<div class="cv-jp-big-play"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></div>' +
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
            '<button class="cv-jp-btn jp-mute" type="button"' + v('mute') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>' +
            '<button class="cv-jp-btn jp-unmute" type="button"' + v('unmute') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg></button>' +
            '<div class="cv-jp-volume jp-volume-bar"><div class="cv-jp-volume-val jp-volume-bar-value"></div></div>' +
            '<button class="cv-jp-btn jp-full-screen" type="button"' + v('fullscreen') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
            '<button class="cv-jp-btn jp-restore-screen" type="button"' + v('exitFullscreen') + ' style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>' +
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
      $wrap.find('.jp-full-screen').attr('aria-label', str(inst, 'fullscreen'));
      $wrap.find('.jp-restore-screen').attr('aria-label', str(inst, 'exitFullscreen'));
    }

    var $jp = $wrap.find('#' + id);
    var $bigPlay = $wrap.find('.cv-jp-big-play');
    var $screen  = $wrap.find('.cv-jp-video-screen');
    var $speed   = $wrap.find('.cv-jp-speed');
    var isPlaying = false;

    function togglePlay() {
      if (isPlaying) $jp.jPlayer('pause');
      else           $jp.jPlayer('play');
    }

    $bigPlay.on('click', togglePlay);
    $screen.on('click', togglePlay);

    $speed.on('change', function() {
      $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
    });

    var $fullscreenBtn = $wrap.find('.jp-full-screen');
    var $restoreBtn = $wrap.find('.jp-restore-screen');
    var wrapEl = $wrap[0];

    function onFullscreenChange() {
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
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
          if (Overlay.$tooltip.parent()[0] !== wrapEl) $wrap.append(Overlay.$tooltip);
        } else {
          var overlayEl = Overlay.$el && Overlay.$el[0];
          if (fsEl === overlayEl) {
            if (Overlay.$tooltip.parent()[0] !== overlayEl) Overlay.$el.append(Overlay.$tooltip);
          } else if (Overlay.$tooltip.parent()[0] !== document.body) {
            $('body').append(Overlay.$tooltip);
          }
        }
      }
    }

    $fullscreenBtn.on('click', function() {
      if (wrapEl.requestFullscreen) wrapEl.requestFullscreen();
      else if (wrapEl.webkitRequestFullscreen) wrapEl.webkitRequestFullscreen();
      else if (wrapEl.mozRequestFullScreen) wrapEl.mozRequestFullScreen();
      else if (wrapEl.msRequestFullscreen) wrapEl.msRequestFullscreen();
    });
    $restoreBtn.on('click', function() {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    });

    $(document).on('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video', function() {
      onFullscreenChange();
    });
    onFullscreenChange();

    function syncPlayPauseUI(playing) {
      $bigPlay.toggleClass('cv-hidden', !!playing);
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(!!playing);
    }
    function syncMuteUI(muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(!!muted);
    }

    $jp.jPlayer({
      ready: function() { $(this).jPlayer('setMedia', media); },
      play: function()  { isPlaying = true;  syncPlayPauseUI(true); },
      pause: function() { isPlaying = false; syncPlayPauseUI(false); },
      ended: function() { isPlaying = false; syncPlayPauseUI(false); },
      volumechange: function(e) {
        var opts = e.jPlayer && e.jPlayer.options;
        var muted = (opts && opts.muted) || (opts && opts.volume === 0);
        syncMuteUI(!!muted);
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

    return {
      destroy: function() {
        $(document).off('fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange.cv-video');
        $jp.jPlayer('destroy');
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: AUDIO (jPlayer)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInAudioNativeRenderer(item, $stage) {
    if (!isSafeResourceUrl(item.src)) return null;
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
    $audio.attr('src', item.src);
    $wrap.find('.cv-audio-native-controls').append($audio);
    $stage.append($wrap);
    return {};
  }

  function builtInAudioRenderer(item, $stage, inst) {
    if (typeof $.fn.jPlayer === 'undefined') return builtInAudioNativeRenderer(item, $stage);
    if (!isSafeResourceUrl(item.src)) return null;

    var id = 'cv-jp-a-' + (++jpCounter);
    var containerId = id + '-ui';
    var supplied = getMediaSupplied(item, inst);
    var media = {}; media[supplied] = item.src;
    var ext = (item.fileExt || item.title || '').split('.').pop().toUpperCase() || 'AUDIO';

    var aTip = (inst && inst.opts.canShowTooltip !== false);
    var a = function(k) { return aTip ? (' data-cv-tooltip="' + escHtml(str(inst, k)) + '"') : ''; };
    var $wrap = $(
      '<div class="cv-audio-wrap">' +
        '<div id="' + id + '" class="cv-jp-player"></div>' +
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

    var $jp = $wrap.find('#' + id);
    var $speed = $wrap.find('.cv-jp-speed');

    $speed.on('change', function() {
      $jp.jPlayer('option', 'playbackRate', parseFloat(this.value));
    });

    function syncAudioPlayPauseUI(playing) {
      $wrap.find('.jp-play').toggle(!playing);
      $wrap.find('.jp-pause').toggle(!!playing);
    }
    function syncAudioMuteUI(muted) {
      $wrap.find('.jp-mute').toggle(!muted);
      $wrap.find('.jp-unmute').toggle(!!muted);
    }

    $jp.jPlayer({
      ready: function() { $(this).jPlayer('setMedia', media); },
      play: function() { syncAudioPlayPauseUI(true); },
      pause: function() { syncAudioPlayPauseUI(false); },
      ended: function() { syncAudioPlayPauseUI(false); },
      volumechange: function(e) {
        var opts = e.jPlayer && e.jPlayer.options;
        var muted = (opts && opts.muted) || (opts && opts.volume === 0);
        syncAudioMuteUI(!!muted);
      },
      supplied: supplied,
      cssSelectorAncestor: '#' + containerId,
      smoothPlayBar: true,
      keyEnabled: false,
      globalVolume: true,
      playbackRate: 1
    });

    return {
      destroy: function() { $jp.jPlayer('destroy'); }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: PDF (pdf.js)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInPdfIframeRenderer(item, $stage) {
    if (!isSafeResourceUrl(item.src)) return null;
    var $wrap = $('<div class="cv-pdf-iframe-wrap"></div>');
    var $iframe = $('<iframe class="cv-pdf-iframe" title="PDF"></iframe>');
    $iframe.attr('src', item.src);
    $wrap.append($iframe);
    $stage.append($wrap);
    return {};
  }

  function builtInPdfRenderer(item, $stage, inst) {
    if (typeof window.pdfjsLib === 'undefined') return builtInPdfIframeRenderer(item, $stage);
    if (!isSafeResourceUrl(item.src)) return null;

    var pdfOpts = inst.opts.pdf || {};
    var showAnnotations = pdfOpts.annotations !== false;
    var useAutoFit = pdfOpts.autoFit !== false;
    var maxScale = (typeof pdfOpts.autoFitMaxScale === 'number' ? pdfOpts.autoFitMaxScale : 2.5);

    var $container = $(
      '<div class="cv-pdf-wrap">' +
        '<div class="cv-pdf-sidebar" style="display:none"><div class="cv-pdf-thumbs"></div></div>' +
        '<div class="cv-pdf-main"><div class="cv-pdf-canvas-wrap"></div></div>' +
      '</div>'
    );

    var $sidebar = $container.find('.cv-pdf-sidebar');
    var $thumbs  = $container.find('.cv-pdf-thumbs');
    var $main = $container.find('.cv-pdf-main');
    var $canvasWrap = $container.find('.cv-pdf-canvas-wrap');

    var pdfDoc = null, pageNum = 1, totalPages = 0;
    var pdfScale = 1.0, rotation = 0;
    var rendering = false;
    var pdfResizeTid = null;
    var scrollTid = null;

    function applyAutoFitScale() {
      if (!useAutoFit || !pdfDoc) return;
      var size = getStageSize();
      pdfDoc.getPage(1).then(function(page) {
        var vp1 = page.getViewport({ scale: 1, rotation: rotation });
        if (size.w > 0 && size.h > 0) {
          pdfScale = Math.max(0.25, Math.min(size.w / vp1.width, size.h / vp1.height, maxScale));
        }
        renderAllPages();
      });
    }

    function updateCurrentPageFromScroll() {
      if (!pdfDoc || totalPages < 1) return;
      var main = $main[0];
      if (!main) return;
      var mainRect = main.getBoundingClientRect();
      var pages = $canvasWrap.find('.cv-pdf-page');
      var best = 1;
      var bestVisible = 0;
      for (var i = 0; i < pages.length; i++) {
        var el = pages[i];
        var num = parseInt(el.getAttribute('data-page'), 10);
        if (!num) continue;
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
        if ($pageInfo) $pageInfo.text(pageNum + ' / ' + totalPages);
        $thumbs.find('.cv-pdf-thumb').removeClass('cv-active');
        $thumbs.find('[data-page="' + pageNum + '"]').addClass('cv-active');
      }
    }

    function renderOnePage(num, done) {
      pdfDoc.getPage(num).then(function(page) {
        var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
        var $pageWrap = $('<div class="cv-pdf-page"></div>');
        $pageWrap.attr('data-page', num);
        $pageWrap.css({ position: 'relative', width: vp.width + 'px', height: vp.height + 'px' });

        var canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.className = 'cv-pdf-canvas';
        $pageWrap.append(canvas);
        $canvasWrap.append($pageWrap);

        var renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        var renderPromise = renderTask.promise || renderTask;
        renderPromise.then(function() {
          if (showAnnotations) renderAnnotations(page, vp, $pageWrap);
          if (done) done();
        });
      });
    }

    function renderAllPages(done) {
      if (rendering || !pdfDoc) return;
      rendering = true;
      $canvasWrap.empty();
      var idx = 0;
      function next() {
        idx++;
        if (idx > totalPages) {
          rendering = false;
          if ($pageInfo) $pageInfo.text(pageNum + ' / ' + totalPages);
          $main.off('scroll.cv-pdf-page').on('scroll.cv-pdf-page', function() {
            clearTimeout(scrollTid);
            scrollTid = setTimeout(updateCurrentPageFromScroll, 80);
          });
          updateCurrentPageFromScroll();
          if (done) done();
          return;
        }
        renderOnePage(idx, next);
      }
      next();
    }

    function renderPage(num) {
      if (rendering || !pdfDoc) return;
      rendering = true;
      pageNum = num;
      $canvasWrap.empty();
      pdfDoc.getPage(num).then(function(page) {
        var vp = page.getViewport({ scale: pdfScale, rotation: rotation });
        var $pageWrap = $('<div class="cv-pdf-page"></div>');
        $pageWrap.attr('data-page', num);
        $pageWrap.css({ position: 'relative', width: vp.width + 'px', height: vp.height + 'px' });

        var canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.className = 'cv-pdf-canvas';
        $pageWrap.append(canvas);
        $canvasWrap.append($pageWrap);

        var renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        var renderPromise = renderTask.promise || renderTask;
        renderPromise.then(function() {
          if (showAnnotations) renderAnnotations(page, vp, $pageWrap);
          rendering = false;
          if ($pageInfo) $pageInfo.text(pageNum + ' / ' + totalPages);
        });
      });
    }

    function normalizeRectFallback(r) {
      if (!r || r.length < 4) return [0, 0, 0, 0];
      var x1 = r[0], y1 = r[1], x2 = r[2], y2 = r[3];
      return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    }

    function renderAnnotations(page, viewport, $pageWrap) {
      page.getAnnotations().then(function(annotations) {
        if (!annotations || !annotations.length) return;
        var convertToViewport = viewport.convertToViewportRectangle || viewport.convertToViewport;
        if (!convertToViewport) return;
        var normalizeRect = (typeof pdfjsLib.Util !== 'undefined' && typeof pdfjsLib.Util.normalizeRect === 'function')
          ? pdfjsLib.Util.normalizeRect
          : normalizeRectFallback;

        var $layer = $('<div class="cv-pdf-annotations"></div>');
        $layer.css({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' });

        for (var i = 0; i < annotations.length; i++) {
          var ann = annotations[i];
          if (!ann.rect) continue;

          var rawRect = convertToViewport.call(viewport, ann.rect);
          var rect = normalizeRect(rawRect);

          var $el = $('<div class="cv-pdf-annot"></div>');
          $el.css({
            position: 'absolute',
            left:   rect[0] + 'px',
            top:    rect[1] + 'px',
            width:  (rect[2] - rect[0]) + 'px',
            height: (rect[3] - rect[1]) + 'px'
          });

          if (ann.subtype === 'Link' && ann.url && isSafeResourceUrl(ann.url)) {
            var $link = $('<a class="cv-pdf-annot-link"></a>');
            $link.attr({ href: ann.url, target: '_blank' });
            $link.css({ display: 'block', width: '100%', height: '100%' });
            $el.append($link);
          } else if (ann.subtype === 'Link' && ann.dest) {
            (function(dest) {
              $el.css('cursor', 'pointer');
              $el.on('click', function() {
                if (typeof dest === 'number') { goToPage(dest + 1); }
                else if (Array.isArray(dest)) {
                  pdfDoc.getPageIndex(dest[0]).then(function(idx) { goToPage(idx + 1); });
                }
              });
            })(ann.dest);
          }

          if (ann.subtype === 'Highlight') {
            $el.addClass('cv-pdf-annot-highlight');
          }

          $layer.append($el);
        }

        $pageWrap.append($layer);
      });
    }

    function buildThumbnail(num) {
      pdfDoc.getPage(num).then(function(page) {
        var vp = page.getViewport({ scale: 0.25 });
        var c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        var $t = $('<div class="cv-pdf-thumb' + (num === 1 ? ' cv-active' : '') + '" data-page="' + num + '"></div>');
        $t.append(c).append('<span class="cv-pdf-thumb-num">' + num + '</span>');
        $t.on('click', function() { goToPage(num); });
        $thumbs.append($t);
        page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      });
    }

    function goToPage(num) {
      if (num < 1 || num > totalPages) return;
      pageNum = num;
      if ($pageInfo) $pageInfo.text(pageNum + ' / ' + totalPages);
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

    var docParams = { url: item.src };
    if (pdfOpts.cMapUrl) {
      docParams.cMapUrl = pdfOpts.cMapUrl;
      docParams.cMapPacked = pdfOpts.cMapPacked !== false;
    }

    function getStageSize() {
      var $wrap = Overlay.$stageWrap;
      return {
        w: ($wrap && $wrap.length ? $wrap.width() : 0) || $stage.width() || 600,
        h: ($wrap && $wrap.length ? $wrap.height() : 0) || $stage.height() || 800
      };
    }

    var loadingTask = (typeof docParams === 'object' && docParams.url) ? pdfjsLib.getDocument(docParams) : pdfjsLib.getDocument(item.src);
    var loadPromise = loadingTask.promise || loadingTask;
    loadPromise.then(function(pdf) {
      pdfDoc = pdf; totalPages = pdf.numPages;
      Overlay.$loader.removeClass('cv-active');

      function runInitialScaleAndRender() {
        var size = getStageSize();
        var wrapW = size.w;
        var wrapH = size.h;

        pdf.getPage(1).then(function(fp) {
          var vp = fp.getViewport({ scale: 1 });
          if (useAutoFit && wrapW > 0 && wrapH > 0) {
            pdfScale = Math.max(0.25, Math.min(wrapW / vp.width, wrapH / vp.height, maxScale));
          } else if (!useAutoFit && wrapW > 0) {
            pdfScale = Math.max(0.25, Math.min(wrapW / vp.width, maxScale));
          } else {
            pdfScale = Math.min(1, maxScale);
          }
          renderAllPages(function() {
            for (var i = 1; i <= totalPages; i++) buildThumbnail(i);
          });
          if (useAutoFit) {
            $(window).on('resize.cv-pdf-autofit', function() {
              clearTimeout(pdfResizeTid);
              pdfResizeTid = setTimeout(applyAutoFitScale, 150);
            });
          }
        });
      }

      /* Defer so layout is complete after container is in DOM (autoFit needs correct stage size) */
      requestAnimationFrame(function() {
        requestAnimationFrame(runInitialScaleAndRender);
      });
    }, function() {
      Overlay.$loader.removeClass('cv-active');
      builtInErrorCard($stage, 'PDF could not be loaded', item);
    });

    $stage.append($container);

    /* toolbar items */
    var tipAttr = (inst && inst.opts.canShowTooltip !== false) ? function(k) { return ' data-cv-tooltip="' + escHtml(str(inst, k)) + '"'; } : function() { return ''; };
    var ariaAttr = (inst && inst.opts.wcag) ? function(k) { return ' aria-label="' + escHtml(str(inst, k)) + '"'; } : function() { return ''; };
    var toolbarItems = [];
    var $tbThumb = $('<button class="cv-tb-btn"' + tipAttr('thumbnails') + ariaAttr('thumbnails') + '>' + Icons.thumbnails + '</button>');
    $tbThumb.on('click', function() { $sidebar.toggle(); $tbThumb.toggleClass('cv-active'); });
    toolbarItems.push($tbThumb[0]);

    var $tbPrev = $('<button class="cv-tb-btn"' + tipAttr('previousPage') + ariaAttr('previousPage') + '>' + Icons.prevPage + '</button>');
    $tbPrev.on('click', function() { goToPage(pageNum - 1); });
    toolbarItems.push($tbPrev[0]);

    var $pageInfo = $('<span class="cv-pdf-page-info">1 / -</span>');
    toolbarItems.push($pageInfo[0]);

    var $tbNext = $('<button class="cv-tb-btn"' + tipAttr('nextPage') + ariaAttr('nextPage') + '>' + Icons.nextPage + '</button>');
    $tbNext.on('click', function() { goToPage(pageNum + 1); });
    toolbarItems.push($tbNext[0]);

    toolbarItems.push('separator');

    var $tbZoomOut = $('<button class="cv-tb-btn cv-tb-pdf-zoom-out"' + tipAttr('zoomOut') + ariaAttr('zoomOut') + '>' + Icons.zoomOut + '</button>');
    $tbZoomOut.on('click', function() { pdfScale = Math.max(0.25, pdfScale - 0.25); renderAllPages(); });
    toolbarItems.push($tbZoomOut[0]);

    var $tbZoomIn = $('<button class="cv-tb-btn cv-tb-pdf-zoom-in"' + tipAttr('zoomIn') + ariaAttr('zoomIn') + '>' + Icons.zoomIn + '</button>');
    $tbZoomIn.on('click', function() { pdfScale = Math.min(5, pdfScale + 0.25); renderAllPages(); });
    toolbarItems.push($tbZoomIn[0]);

    var $tbRotate = $('<button class="cv-tb-btn"' + tipAttr('rotate') + ariaAttr('rotate') + '>' + Icons.rotateCw + '</button>');
    $tbRotate.on('click', function() { rotation = (rotation + 90) % 360; renderAllPages(); });
    toolbarItems.push($tbRotate[0]);

    var $tbPrint = $('<button class="cv-tb-btn cv-tb-pdf-print"' + tipAttr('print') + ariaAttr('print') + '>' + Icons.print + '</button>');
    $tbPrint.on('click', function() {
      var $page = $canvasWrap.find('.cv-pdf-page[data-page="' + pageNum + '"]');
      var canvas = $page.length ? $page.find('canvas')[0] : $canvasWrap.find('canvas')[0];
      if (!canvas) return;
      var win = window.open('');
      var dataUrl = canvas.toDataURL().replace(/"/g, '&quot;');
      win.document.write('<img src="' + dataUrl + '" onload="window.print();window.close();" />');
    });
    toolbarItems.push($tbPrint[0]);

    return {
      toolbar: toolbarItems,
      destroy: function() {
        clearTimeout(pdfResizeTid);
        clearTimeout(scrollTid);
        $(window).off('resize.cv-pdf-autofit');
        $main.off('scroll.cv-pdf-page');
        if (pdfDoc) pdfDoc.destroy();
      }
    };
  }

  function minimalMarkdownToHtml(text) {
    if (text == null || typeof text !== 'string') return '';
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

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: INLINE (source code: js, jsp, java, etc.)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInInlineRenderer(item, $stage) {
    function renderContent(text) {
      var lines = (text == null ? '' : String(text)).split(/\r\n|\n|\r/);
      var html = '';
      for (var i = 0; i < lines.length; i++) {
        html += '<div class="cv-inline-line">' +
          '<span class="cv-inline-num">' + (i + 1) + '</span>' +
          '<span class="cv-inline-code">' + escHtml(lines[i]) + '</span>' +
          '</div>';
      }
      return html;
    }

    function showInline(content) {
      var $wrap = $(
        '<div class="cv-inline-wrap">' +
          '<div class="cv-inline-body">' + renderContent(content) + '</div>' +
        '</div>'
      );
      $stage.append($wrap);
    }

    if (item.content != null && typeof item.content === 'string') {
      showInline(item.content);
      return {};
    }
    if (item.src && isSafeResourceUrl(item.src)) {
      var $placeholder = $('<div class="cv-inline-wrap"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(item.src, { method: 'GET' })
        .then(function(r) { return r.text(); })
        .then(function(text) {
          $placeholder.find('.cv-inline-loading').replaceWith($('<div class="cv-inline-body">').html(renderContent(text)));
        })
        .catch(function() {
          $placeholder.remove();
          builtInErrorCard($stage, 'Could not load file for inline view', item);
        });
      return {};
    }
    builtInErrorCard($stage, 'No content or invalid URL for inline view', item);
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: UNSUPPORTED
     ═══════════════════════════════════════════════════════════════════ */

  function builtInUnsupportedRenderer(item, $stage) {
    var ext  = (item.fileExt || (item.title || '').split('.').pop() || '').toUpperCase();
    var size = item.fileSize || '';
    var $card = $(
      '<div class="cv-unsupported">' +
        '<div class="cv-unsupported-icon">' + Icons.fileIcon + '</div>' +
        (ext ? '<div class="cv-unsupported-ext">' + escHtml(ext) + '</div>' : '') +
        '<div class="cv-unsupported-name">' + escHtml(item.title || 'File') + '</div>' +
        (size ? '<div class="cv-unsupported-size">' + escHtml(size) + '</div>' : '') +
        '<p class="cv-unsupported-msg">Preview is not available for this file</p>' +
        (item.src || item.downloadUrl
          ? '<button class="cv-unsupported-dl" type="button">' + Icons.download + ' Download</button>' : '') +
      '</div>'
    );
    $card.find('.cv-unsupported-dl').on('click', function() {
      var url = item.downloadUrl || item.src; if (!url || !isSafeDownloadUrl(url)) return;
      var a = document.createElement('a');
      a.href = url; a.download = safeDownloadFilename(item.title); a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    $stage.append($card);
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: ERROR (type "error" — cannot preview; same template as unsupported, onRender can override)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInErrorRenderer(item, $stage) {
    var message = (item.message != null && item.message !== '') ? String(item.message)
      : (item.errorMessage != null && item.errorMessage !== '') ? String(item.errorMessage)
      : 'Preview is not available for this file';
    var ext = (item.fileExt || (item.title || '').split('.').pop() || '').toUpperCase();
    var size = item.fileSize || '';
    var $card = $(
      '<div class="cv-unsupported">' +
        '<div class="cv-unsupported-icon">' + Icons.fileIcon + '</div>' +
        (ext ? '<div class="cv-unsupported-ext">' + escHtml(ext) + '</div>' : '') +
        '<div class="cv-unsupported-name">' + escHtml(item.title || 'File') + '</div>' +
        (size ? '<div class="cv-unsupported-size">' + escHtml(size) + '</div>' : '') +
        '<p class="cv-unsupported-msg">' + escHtml(message) + '</p>' +
        (item.src || item.downloadUrl
          ? '<button class="cv-unsupported-dl" type="button">' + Icons.download + ' Download</button>' : '') +
      '</div>'
    );
    $card.find('.cv-unsupported-dl').on('click', function() {
      var url = item.downloadUrl || item.src; if (!url || !isSafeDownloadUrl(url)) return;
      var a = document.createElement('a');
      a.href = url; a.download = safeDownloadFilename(item.title); a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    $stage.append($card);
    return {};
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: HTML (user-provided HTML; no toolbar, no download)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInHtmlRenderer(item, $stage) {
    var html = item.html;
    if (html == null || (typeof html === 'string' && String(html).trim() === '')) {
      builtInErrorCard($stage, 'No HTML provided for html view', item);
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
      builtInErrorCard($stage, 'No HTML provided for html view', item);
      return null;
    }
    setTimeout(function() { Overlay.$loader.removeClass('cv-active'); }, 120);
    return {};
  }

  /* ═══════════════════════════════════════════════════════════════════
     BUILT-IN: MARKDOWN (render .md as HTML; content or fetch from src)
     ═══════════════════════════════════════════════════════════════════ */

  function builtInMarkdownRenderer(item, $stage, inst) {
    function getMarkdownRenderer() {
      if (typeof window.marked === 'function' || (window.marked && typeof window.marked.parse === 'function')) {
        return function(md) { return window.marked.parse ? window.marked.parse(md) : window.marked(md); };
      }
      return minimalMarkdownToHtml;
    }

    function showMarkdown(html) {
      var $wrap = $('<div class="cv-markdown-body"></div>').html(html);
      $stage.append($wrap);
    }

    if (item.content != null && typeof item.content === 'string') {
      var renderer = getMarkdownRenderer();
      showMarkdown(renderer(item.content));
      return {};
    }
    if (item.src && isSafeResourceUrl(item.src)) {
      var fetchUrl = item.src;
      if (fetchUrl.indexOf('http') !== 0 && fetchUrl.indexOf('blob') !== 0 && fetchUrl.indexOf('data:') !== 0) {
        try {
          fetchUrl = new URL(fetchUrl, window.location.href).href;
        } catch (e) {}
      }
      Overlay.$loader.addClass('cv-active');
      var $placeholder = $('<div class="cv-markdown-body"><div class="cv-inline-loading"><div class="cv-inline-spinner"></div></div></div>');
      $stage.append($placeholder);
      fetch(fetchUrl, { method: 'GET' })
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function(text) {
          var renderer = getMarkdownRenderer();
          $placeholder.html(renderer(text));
          Overlay.$loader.removeClass('cv-active');
        })
        .catch(function() {
          $placeholder.remove();
          Overlay.$loader.removeClass('cv-active');
          builtInErrorCard($stage, 'Could not load file for markdown view', item);
        });
      return {};
    }
    builtInErrorCard($stage, 'No content or invalid URL for markdown view', item);
    return null;
  }

  function builtInErrorCard($stage, message, item, options) {
    options = options || {};
    var showDl = !options.noDownload && (item.src || item.downloadUrl);
    var $card = $(
      '<div class="cv-error-card">' + Icons.error +
        '<p class="cv-error-text">' + escHtml(message) + '</p>' +
        (showDl ? '<button class="cv-error-dl" type="button">' + Icons.download + ' Download source</button>' : '') +
      '</div>'
    );
    if (showDl) {
      $card.find('.cv-error-dl').on('click', function() {
        var url = item.downloadUrl || item.src; if (!url || !isSafeDownloadUrl(url)) return;
        var a = document.createElement('a');
        a.href = url; a.download = safeDownloadFilename(item.title); a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
    }
    $stage.append($card);
  }

  /* ═══════════════════════════════════════════════════════════════════
     COMPONENTVIEWER CLASS
     ═══════════════════════════════════════════════════════════════════ */

  function ComponentViewer($container, options) {
    this.id = ++ComponentViewer._counter;
    this.$container = $container;
    this.opts = $.extend(true, {}, DEFAULTS, options);
    var so = this.opts.stageOnly;
    if (so === true || so === false) {
      this.opts.stageOnly = { enabled: !!so, hideNavigation: false };
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
    _collectItems: function() {
      var self = this; this.items = [];
      this.$container.find(this.opts.selector).each(function() {
        var $el = $(this);
        var src = $el.attr('data-src') || $el.data('src') || $el.attr('href') || $el.find('img').attr('src');
        var fileExt = ($el.data('ext') || (src || '').split('.').pop() || '').toLowerCase();
        var defaultType = $el.data('type') || (fileExt === 'md' ? 'markdown' : 'image');
        var defaultItem = {
          type: defaultType,
          src: src,
          title: $el.data('title') || $el.attr('title') || '',
          downloadUrl: $el.data('download') || null,
          fileExt: $el.data('ext') || null,
          fileSize: $el.data('size') || null,
          mimeType: $el.data('mime') || null,
          thumbnailUrl: $el.data('thumbnail') || $el.data('poster') || null,
          message: $el.data('message') || null,
          html: $el.data('html') || null,
          content: $el.data('content') || null,
          pollOptionLabel: $el.data('pollOptionLabel') || null,
          pollOptionId: $el.data('pollOptionId') != null ? $el.data('pollOptionId') : null
        };
        var item = typeof self.opts.itemData === 'function' ? self.opts.itemData($el, defaultItem) : defaultItem;
        if (item == null) item = defaultItem;
        item.$el = $el; self.items.push(item);
      });
    },
    _bindClicks: function() {
      var self = this, ns = '.cv-' + this.id;
      this.$container.find(this.opts.selector).off(ns).on('click' + ns, function(e) {
        e.preventDefault();
        var idx = self.$container.find(self.opts.selector).index(this);
        if (idx >= 0) self.open(idx);
      });
    },
    open: function(index) {
      this.idx = (typeof index === 'number') ? index : 0;
      this._slideshowPaused = false;
      this._slideshowPlaying = false;
      Overlay.open(this);
    },
    close: function() { Overlay.close(); },
    next: function(opts) {
      if (this.items.length < 2) return;
      if (this._slideshowTimer) { clearTimeout(this._slideshowTimer); this._slideshowTimer = null; }
      this._firePrevClose(this.items[this.idx]);
      this.idx = this.opts.loop ? (this.idx + 1) % this.items.length : Math.min(this.items.length - 1, this.idx + 1);
      Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    prev: function(opts) {
      if (this.items.length < 2) return;
      if (this._slideshowTimer) { clearTimeout(this._slideshowTimer); this._slideshowTimer = null; }
      this._firePrevClose(this.items[this.idx]);
      this.idx = this.opts.loop ? (this.idx - 1 + this.items.length) % this.items.length : Math.max(0, this.idx - 1);
      Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    goTo: function(index, opts) {
      if (index < 0 || index >= this.items.length) return;
      if (this._slideshowTimer) { clearTimeout(this._slideshowTimer); this._slideshowTimer = null; }
      this._firePrevClose(this.items[this.idx]);
      this.idx = index; Overlay.loadItem((opts && opts.transition) ? { transition: true } : undefined);
    },
    currentItem: function() { return this.items[this.idx]; },
    setTheme: function(theme) {
      if (theme !== 'dark' && theme !== 'light') return;
      this.opts.theme = theme;
      if (Overlay.activeInstance === this) {
        Overlay.$el[0].className = 'cv-overlay cv-theme-' + theme;
        Overlay._syncThemeToggle();
      }
      if (typeof this.opts.onThemeChange === 'function') this.opts.onThemeChange(theme, this);
    },
    refresh: function() {
      var wasOpen = Overlay.visible && Overlay.activeInstance === this;
      this._collectItems(); this._bindClicks();
      if (wasOpen && this.items.length) { this.idx = Math.min(this.idx, this.items.length - 1); Overlay.loadItem(); }
      else if (wasOpen) this.close();
    },
    destroy: function() {
      this.$container.find(this.opts.selector).off('.cv-' + this.id);
      this.$container.removeData('cv-instance');
      if (Overlay.activeInstance === this) Overlay.close();
      this.items = []; this.opts = null;
    },
    _firePrevClose: function(item) {
      if (typeof this.opts.onClose === 'function' && item) this.opts.onClose(item, this);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     JQUERY PLUGIN
     ═══════════════════════════════════════════════════════════════════ */

  $.fn[PLUGIN_NAME] = function(methodOrOptions) {
    if (typeof methodOrOptions === 'string') {
      var args = [].slice.call(arguments, 1), ret;
      this.each(function() {
        var inst = $(this).data('cv-instance');
        if (inst && typeof inst[methodOrOptions] === 'function') ret = inst[methodOrOptions].apply(inst, args);
      });
      return ret !== undefined ? ret : this;
    }
    return this.each(function() {
      var $el = $(this);
      if ($el.data('cv-instance')) return;
      $el.data('cv-instance', new ComponentViewer($el, methodOrOptions));
    });
  };

  $.fn[PLUGIN_NAME].defaults = DEFAULTS;
  $.fn[PLUGIN_NAME].Icons = Icons;
  $.fn[PLUGIN_NAME].defaultStrings = DEFAULT_STRINGS;

})(jQuery, window, document);
