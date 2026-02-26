# ComponentViewer

A jQuery plugin that opens attachments (images, video, audio, PDF, inline content, and more) in a shared overlay with a consistent toolbar, themes, and optional accessibility (WCAG) support. Built for feed- or post-style UIs where each container has its own set of items.

**License:** MIT

---

## Table of contents

- [Demo](#demo)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Options reference](#options-reference)
- [Item data](#item-data)
- [Content types](#content-types)
- [Toolbar](#toolbar)
- [Poll options](#poll-options)
- [Callbacks](#callbacks)
- [Public API](#public-api)
- [Accessibility (WCAG)](#accessibility-wcag)
- [Browser support](#browser-support)
- [Examples](#examples)

---

## Demo

Try the plugin in your browser with the full example page, which includes all content types, toolbar customisation, themes, poll options, loop/counter options, and image failure handling.

**[Open example.html](example.html)** — open this file in a browser to see multiple demo cases and use the programmatic API buttons to open specific items.

The example page uses jQuery 3.7, jPlayer, and PDF.js (loaded from CDN). For a minimal setup without jPlayer/PDF.js, see [example-no-libs.html](example-no-libs.html). For jQuery 1.7 compatibility, see [example-jquery1.7.html](example-jquery1.7.html).

---

## Installation

### Dependencies

- **jQuery** (1.7+ or 2.x/3.x)
- **Optional:** [jPlayer](https://jplayer.org/) for video/audio playback
- **Optional:** [PDF.js](https://mozilla.github.io/pdf.js/) for PDF rendering

Include the plugin and stylesheet after jQuery:

```html
<link rel="stylesheet" href="component-viewer.css" />
<script src="jquery.min.js"></script>
<script src="component-viewer.js"></script>
```

For video/audio with jPlayer, include jPlayer before the plugin. For PDF with pdf.js, include the library and set `pdf.workerSrc`.

---

## Quick start

1. **Mark up your items** with a common selector (default: `.cv-item`) and use `data-*` attributes for type, source, and title:

```html
<div id="my-gallery">
  <a class="att cv-item" data-type="image" data-title="Photo.jpg" href="https://example.com/photo.jpg">
    <img src="https://example.com/photo-thumb.jpg" alt="" />
  </a>
  <div class="att cv-item" data-type="pdf" data-title="Doc.pdf" data-src="https://example.com/doc.pdf" data-ext="PDF">
    PDF
  </div>
</div>
```

2. **Initialize the viewer** on the container:

```javascript
$('#my-gallery').componentViewer({
  toolbar: { download: true, zoom: true },
  pdf: { workerSrc: 'path/to/pdf.worker.min.js' }
});
```

3. **Click any item** to open it in the overlay. Use prev/next to move between items.

---

## Options reference

All options are optional. Defaults are in `$.fn.componentViewer.defaults`.

### General

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `selector` | string | `'.cv-item'` | CSS selector for items inside the container. |
| `loop` | boolean | `true` | If `true`, prev from first goes to last and next from last goes to first. If `false`, prev/next are hidden at first/last. |
| `overlayClose` | boolean | `true` | Close overlay when clicking the backdrop. |
| `keyboardNav` | boolean | `true` | Escape closes; Left/Right move prev/next. |
| `showCounter` | boolean | `true` | Show the "1 / 6" counter in the header. Set to `false` to hide it. |
| `preloadAdjacentImages` | boolean | `true` | When `true`, the next and previous items are preloaded if they are images, so navigating to them is instant (Colorbox-style). Set to `false` to disable. |
| `carousel` | object | `{ enabled: false, navThreshold: 4 }` | Carousel options. Set <code>carousel.enabled: true</code> to show a header button that toggles a strip of thumbnails below the stage. <code>carousel.navThreshold</code> (default 4): when item count exceeds this, prev/next buttons appear on the strip. |
| `slideshow` | object \| `null` | `null` | When set to an object with `enabled: true`, the viewer auto-advances to the next item. Options: `interval` (seconds, default 4), `autoStart` (default `true`), `advanceMedia`: `'interval'` or `'onEnd'`. A "Play slideshow" / "Pause slideshow" toolbar button is shown; when `autoStart: true`, the button shows "Pause slideshow" initially. |
| `theme` | string | `'dark'` | Initial theme: `'dark'` or `'light'`. |
| `themeToggle` | boolean | `true` | Show the theme (dark/light) toggle in the header. |
| `fullscreen` | boolean | `true` | Show a header button to toggle overlay fullscreen (native Fullscreen API). Set to `false` to hide. Does not affect video/audio fullscreen. |
| `onThemeChange` | function | `null` | `function(theme, viewer)` called when theme changes. |

### PDF

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pdf.workerSrc` | string | `null` | URL to pdf.js worker (required for PDF.js). |
| `pdf.cMapUrl` | string | `null` | Optional CMap URL for fonts. |
| `pdf.cMapPacked` | boolean | `true` | Use packed CMaps. |
| `pdf.annotations` | boolean | `true` | Render PDF annotations. |
| `pdf.autoFit` | boolean | `true` | Scale page to fit stage (width and height). |
| `pdf.autoFitMaxScale` | number | `2.5` | Max scale when `autoFit` is true. |

### Media (jPlayer)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `supportedVideoFormats` | string | `null` | Comma-separated jPlayer formats for video (e.g. `'m4v, webmv'`). |
| `supportedAudioFormats` | string | `null` | Comma-separated jPlayer formats for audio (e.g. `'mp3, oga'`). |

### Data and callbacks

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `itemData` | function | `null` | `function($el, defaultItem)` — returns the item object for each element. Second argument is the item the plugin would build from `data-*` and DOM; you can add properties to `defaultItem` and return it, or return a new object. If `null`, item is built from `data-*` and DOM. |
| `onDownload` | function | `null` | `function(item, viewer)`. If provided, called when Download is clicked; otherwise default link download. |
| `onRender` | function | `null` | `function(item, $stage, viewer)`. If it appends to `$stage`, built-in renderer is skipped. May return `{ toolbar, destroy }`. |
| `onToolbar` | function | `null` | `function(item, defaultToolbar, viewer)`. Modify or replace the toolbar array. |
| `onLoading` | function | `null` | `function(item, viewer)` before an item is loaded. |
| `onOpen` | function | `null` | `function(item, $stage, viewer)` after the item is shown. |
| `onClose` | function | `null` | `function(item, viewer)` when the overlay closes. |

### Accessibility

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wcag` | boolean | `false` | If `true`, enables focus trap, focus save/restore, dialog ARIA, and button labels. |

### Poll option

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollOption` | object | `null` | When set (e.g. `{ enabled: true, mode: 'radio', onSelect }`), items with `pollOptionLabel` show a row above the toolbar. |
| `pollOption.enabled` | boolean | — | Must be `true` to show poll UI. |
| `pollOption.mode` | string | `'radio'` | `'radio'` or `'checkbox'`. |
| `pollOption.onSelect` | function | — | `function(item, selected, viewer)`. `selected` is the new checked state. |

---

## Item data

When `itemData` is not used, each item is built from the matched element:

| Field | Source |
|-------|--------|
| `type` | `data-type` or `'image'` |
| `src` | `data-src` or `href` or first `img[src]` |
| `title` | `data-title` or `title` or `''` |
| `downloadUrl` | `data-download` |
| `fileExt` | `data-ext` |
| `fileSize` | `data-size` |
| `thumbnailUrl` | `data-thumbnail` or `data-poster` |
| `message` | `data-message` |
| `html` | `data-html` (for type `html`) |
| `pollOptionLabel` | `data-poll-option-label` |
| `pollOptionId` | `data-poll-option-id` |
| `supplied` | `data-supplied` (jPlayer format override) |

Use `itemData` to return a custom object per element. The callback receives `($el, defaultItem)`; you can add or override properties on `defaultItem` and return it, or return a new object (e.g. from your API).

---

## Content types

The plugin chooses a renderer by `item.type` (default `'image'`).

### Renderer order

1. **onRender(item, $stage, viewer)** — If it appends to `$stage`, the built-in renderer is skipped. Can return `{ toolbar: [...], destroy: function() }`.
2. **Built-in by type:** image, video, audio, pdf, inline, error, html.
3. **Unsupported** — If the stage is still empty, a "no preview" card is shown.

### Built-in types

| Type | Description |
|------|-------------|
| **image** | Image with zoom slider, wheel/pinch zoom, and drag pan. Invalid or failed load shows an error card without download; toolbar and footer are hidden. |
| **video** | jPlayer (or native `<video>` if jPlayer not loaded). |
| **audio** | jPlayer (or native `<audio>`). |
| **pdf** | PDF.js with page nav, thumbnails, zoom, rotate, print. Falls back to iframe if PDF.js not loaded. |
| **inline** | Source/code view with line numbers. Content from `item.content` or fetched from `item.src`. |
| **error** | "Cannot preview" card with optional message and Download. |
| **html** | User-provided HTML in the stage. No toolbar, no download. |
| **Other** | Unsupported card with file icon, name, and optional Download. |

---

## Toolbar

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `toolbar.download` | boolean | `true` | Show the built-in Download button (when applicable). |
| `toolbar.zoom` | boolean | `true` | Show zoom widget for image items. |
| `toolbarItems` | array | `[]` | Custom toolbar items (objects, `'separator'`, or DOM nodes). |
| `zoom.min` | number | `1` | Minimum image zoom. |
| `zoom.max` | number | `5` | Maximum image zoom. |
| `zoom.step` | number | `0.01` | Slider step. |
| `zoom.wheelStep` | number | `0.15` | Zoom change per mouse wheel step. |
| `zoom.showPercentage` | boolean | `false` | Show zoom percentage (e.g. "150%") in the zoom widget. |
| `zoom.onZoom` | function | `null` | `function(zoomLevel, item, viewer)` when zoom changes. |

- **Resolution:** For built-in renderers, toolbar = renderer toolbar + `toolbarItems` + Download (when enabled). Zoom widget is shown for image items when `toolbar.zoom` is true.
- **onToolbar** can modify or replace the toolbar array before it is rendered.
- **onRender** can return a `toolbar` array for full control (no auto download/zoom).

### Ways to build the toolbar

| Source | Description |
|--------|-------------|
| **Renderer** | Built-in renderers (e.g. PDF) can return a `toolbar` array (buttons, separators, or DOM nodes). |
| **toolbarItems** | Option array merged after the renderer toolbar (with an optional separator before it). |
| **onToolbar** | Callback receives the merged array and can modify or replace it before rendering. |
| **onRender** | If you return `{ toolbar: [...] }`, that array is used as the full toolbar (no auto download/zoom). |
| **Download** | When `toolbar.download` is true, a Download button is appended after all items. |
| **Zoom widget** | Shown for image items when `toolbar.zoom` is true (separate from the toolbar array). |

### Toolbar entry types

Each element in a toolbar array can be one of:

| Type | Syntax | Description |
|------|--------|-------------|
| **Object** | `{ id, icon, label, ... }` | Rendered as a button. See object properties below. |
| **Separator** | `'separator'` or `'-'` | Rendered as a visual separator between buttons. |
| **DOM** | `HTMLElement` or jQuery object | Appended as-is (e.g. a span for "Page 1 / 10"). |

### Toolbar item object properties

When an entry is an object, the following properties are supported:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | — | Optional. Adds CSS class <code>cv-tb-<em>id</em></code> to the button. |
| `icon` | string | — | Icon: HTML string (e.g. <code>&lt;svg&gt;...&lt;/svg&gt;</code>) or CSS class (e.g. <code>fa fa-share</code>). HTML is sanitized. |
| `label` | string | — | Text label; used as tooltip if <code>tooltip</code> is not set. |
| `tooltip` | string | — | Button <code>title</code> and, when <code>wcag</code> is true, <code>aria-label</code>. Falls back to <code>label</code> or <code>id</code>. |
| `showLabel` | boolean | `false` | If <code>true</code>, the label is shown as text beside the icon. |
| `className` | string | — | Extra CSS class(es) on the button. |
| `visible` | boolean or function | `true` | If <code>false</code> or a function that returns <code>false</code>, the button is not rendered. Function: <code>visible(item, viewer)</code>. |
| `onClick` | function | — | <code>function(item, viewer)</code> — called when the button is clicked. |

Example:

```javascript
toolbarItems: [
  { id: 'share', icon: 'fa fa-share', label: 'Share', onClick: function(item) { /* ... */ } },
  'separator',
  { id: 'delete', label: 'Delete', visible: function(item) { return item.canDelete; }, onClick: fn }
]
```

---

## Poll options

When `pollOption.enabled` is true and an item has `pollOptionLabel`, a row appears above the toolbar with the label and a radio or checkbox.

- **mode:** `'radio'` (single choice) or `'checkbox'` (multiple).
- **onSelect(item, selected, viewer)** is called when the user toggles; `selected` is the new checked state.

Useful for polls where each option is an image or attachment.

---

## Callbacks

| Callback | When |
|----------|------|
| `onLoading(item, viewer)` | Before the item is loaded. |
| `onOpen(item, $stage, viewer)` | After the item is shown and toolbar is built. |
| `onClose(item, viewer)` | When the overlay closes (item was the visible one). |
| `onThemeChange(theme, viewer)` | When the user toggles theme. |
| `onDownload(item, viewer)` | When the Download button is clicked (if provided). |
| `onRender(item, $stage, viewer)` | First chance to render; if you append to `$stage`, built-in is skipped. |
| `onToolbar(item, defaultToolbar, viewer)` | To modify the toolbar before it is rendered. |

---

## Public API

Call methods via the jQuery plugin or on the stored instance.

### Initialization

```javascript
$(container).componentViewer(options);
```

### Methods

```javascript
$(container).componentViewer('open', index);   // Open at index (default 0)
$(container).componentViewer('close');
$(container).componentViewer('next');
$(container).componentViewer('prev');
$(container).componentViewer('goTo', index);
$(container).componentViewer('currentItem');   // Returns current item object
$(container).componentViewer('setTheme', 'light' | 'dark');
$(container).componentViewer('refresh');      // Re-collect items, re-bind clicks
$(container).componentViewer('destroy');
```

### Globals

- **Defaults:** `$.fn.componentViewer.defaults`
- **Icons:** `$.fn.componentViewer.Icons` (SVG strings for close, prev, next, zoom, download, etc.)

---

## Accessibility (WCAG)

Set **`wcag: true`** to enable:

- **Focus trap** — Tab and Shift+Tab cycle only inside the overlay.
- **Focus save/restore** — Focus is saved on open and restored on close.
- **Initial focus** — Focus moves to the close button when the overlay opens.
- **ARIA** — Overlay and shell get appropriate roles and attributes; buttons get `aria-label` where needed.

When `wcag` is `false`, these behaviors are disabled and no dialog ARIA is applied.

---

## Browser support

| Browser | Minimum version |
|---------|------------------|
| Chrome (desktop) | 87 |
| Firefox (desktop) | 85 |
| Safari (desktop) | 14.1 |
| Edge (Chromium) | 87 |
| Safari (iOS) | 14.5 |
| Chrome (Android) | 87 |
| Internet Explorer | 11 (partial; not recommended) |

Requires jQuery 1.7+. Optional: jPlayer and PDF.js have their own browser requirements.

---

## Examples

### Basic gallery

```javascript
$('#gallery').componentViewer({
  toolbar: { download: true, zoom: true },
  pdf: { workerSrc: 'pdf.worker.min.js' }
});
```

### Loop disabled, no counter

```javascript
$('#gallery').componentViewer({
  loop: false,
  showCounter: false,
  toolbar: { download: true, zoom: true }
});
```

### Custom item data

```javascript
$('#gallery').componentViewer({
  itemData: function($el, defaultItem) {
    defaultItem.canDelete = $el.data('can-delete');
    defaultItem.attachmentId = $el.data('id');
    return defaultItem;
  },
  toolbar: { download: true }
});
```

### With WCAG and custom download

```javascript
$('#gallery').componentViewer({
  wcag: true,
  onDownload: function(item, viewer) {
    // Custom download logic
    window.location = item.downloadUrl || item.src;
  }
});
```

### Programmatic open

```javascript
var $gallery = $('#gallery').componentViewer({ toolbar: { download: true } });
$gallery.componentViewer('open', 2);  // Open third item
```

---

## File structure

```
component-viewer-v2/
├── component-viewer.js    # Plugin script
├── component-viewer.css   # Styles
├── README.md              # This documentation
├── documentation.html     # Full API docs (HTML, JavaDoc-style)
├── example.html           # Full examples (multiple cases)
├── example-jquery1.7.html # Example with jQuery 1.7
└── example-no-libs.html   # Example without jPlayer/PDF.js
```

**HTML documentation:** Open `documentation.html` in a browser for a detailed, navigable API reference (options, item data, content types, toolbar, callbacks, public API, browser support, and examples).

---

## License

MIT. See the plugin header in `component-viewer.js` for details.
