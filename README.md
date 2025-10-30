# DACTI — Client-side Web AI Assistant for Chrome

DACTI is a Manifest V3 Chrome extension that delivers on-device summarisation, translation, rewriting, writing and proofreading by talking directly to **Gemini Nano** through the Chrome Built-in AI APIs, and transparently falls back to a cloud proxy when local models are unavailable.

---

## ✨ Highlights

- **Gemini Nano first** – uses the Prompt, Summarizer, Translator, Rewriter, Writer and Proofreader APIs built into Chrome.
- **Hybrid execution** – automatic fallback to a proxy/Gemini cloud endpoint (configurable) avec per-call caching and PII masking.
- **Unified panel** – floating UI with Markdown rendering, contextual tooltips, keyboard shortcuts and context-menu triggers.
- **Task orchestration** – background service worker manages cancel/abort, progress updates, per-tab queues and session caching.
- **Ready for production flows** – open-source repo, documented build, and automated tests with Vitest.

---

## 🧱 Architecture Overview

```
├─ src/
│  ├─ background/      # Service worker (MV3) – menus, commands, request orchestration
│  ├─ content/         # Panel UI, event bridge, local AI helpers, Markdown renderer
│  └─ shared/ai/       # Thin wrappers around Gemini APIs (local + cloud fallback)
│
├─ public/manifest.json
├─ scripts/zip.js      # Builds zipped artifact after `pnpm build`
└─ dist/               # Built extension (load into chrome://extensions)
```

- **Background** (`background/index.ts`) handles context menus, keyboard shortcuts, action routing, caching and local/cloud switching.
- **Content** scripts (`content/events.ts`, `content/panel.ts`) render the floating panel, relay progress, execute `ai.*` local APIs and render Markdown results.
- **Shared AI modules** encapsulate each capability (summarise, translate, rewrite, write, proofread) with consistent prompts and local/cloud options.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and **pnpm 9+**
- **Chrome 130+** (Canary/Beta) with *Built-in AI* support  
  Enable the experiment flags if needed:
  - `chrome://flags/#prompt-api-for-gemini-nano`
  - `chrome://flags/#enable-chrome-built-in-ai`
- A Google Cloud proxy endpoint (optional, for cloud fallback)

### Local Model Hardware Notes

Gemini Nano targets relatively recent hardware. Google occasionally updates the official requirements, so check the latest Chrome Built-in AI documentation for authoritative guidance.

Practical tips from testing:


- The first download can take several minutes depending on internet speed and disk throughput—keep Chrome open and the machine powered during this step.

#### Recommended Chrome Flags

For full local functionality, enable the following exploratory flags and restart Chrome. Refer to the [Generative AI Use Policy](https://policies.google.com/terms/generative-ai/use-policy) for the latest guidance.

- `chrome://flags/#enable-chrome-built-in-ai`
- `chrome://flags/#prompt-api-for-gemini-nano`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
- `chrome://flags/#summarization-api-for-gemini-nano`
- `chrome://flags/#writer-api-for-gemini-nano`
- `chrome://flags/#rewriter-api-for-gemini-nano`
- `chrome://flags/#proofreader-api-for-gemini-nano`

### Installation & Build

```bash
pnpm install         # Install dependencies
pnpm dev             # Start Vite in watch mode (rebuilds into dist/)
pnpm build           # Production build + zip (dist/ and release/dacti-extension.zip)
pnpm test            # Run Vitest unit tests (secureRender, Markdown rendering, etc.)
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and choose the `dist/` folder

To refresh after code changes, either run `pnpm dev` in a second terminal (auto rebuilds) or rerun `pnpm build`.

---

## 🧭 Usage Guide

1. **Highlight any text** on a page (or leave nothing selected to use the page title + body).
2. Trigger DACTI via:
   - Context menu (`Right click → DACTI • …`)
   - Toolbar icon (opens the floating panel)
   - Keyboard shortcuts (`Alt+Shift+1…5` for the predefined summarise modes)
3. The floating panel displays live progress, supports Markdown output (copy-ready) and lets you cancel/stop ongoing tasks.
4. Toggle **Local/Cloud** mode, theme, or pick specific variants (summarise modes, translation targets, rewrite styles) directly from the panel.

---

## ⚙️ Configuration & Storage Keys

All preferences are stored in `chrome.storage.local`. Notable keys:

| Key | Description |
| --- | --- |
| `dactiLocalOnly` | Force local-only execution (default determined automatically). |
| `dactiMaskPII` | Enable PII masking when sending to cloud proxy. |
| `dactiTranslateTarget`, `dactiSummarizeMode`, `dactiRewriteStyle` | Persist last used variants. |
| `dactiProxyUrl`, `dactiProxyToken` | Configure optional cloud proxy for fallback. |
| `dactiCloudMode`, `dactiCloudEnabled` | Automatically patched when proxy/token detected. |
| `dactiTheme` | Panel theme (`auto`, `light`, `dark`). |

Session-specific caches (per-tab) live in `chrome.storage.session` and are cleared by Chrome when the session ends.

---

## 🌐 Cloud Fallback (Optional)

If Gemini Nano is unavailable, DACTI can call a proxy that forwards requests to Gemini 2.0 / Firebase AI Logic. Configure:

```js
chrome.storage.local.set({
  dactiProxyUrl: 'https://<your-proxy>/',
  dactiProxyToken: '<optional bearer>',
  dactiCloudMode: 'proxy',
  dactiCloudEnabled: true
});
```

If no proxy is supplied but `dactiUserApiKey` is set, the extension falls back to the official Gemini REST API.

---

## 🧪 Testing Checklist

- [ ] Gemini Nano enabled, local summarise/translate/rewrite/write/proofread work offline.
- [ ] Context-menu actions update the panel (button highlight, progress, cancel).
- [ ] Panel actions handle no-selection case (page context) correctly.
- [ ] Markdown output renders as expected (headings, bullet lists, links, inline code).
- [ ] Cloud proxy fallback tested with connectivity disabled and re-enabled.
- [ ] Build output loads cleanly in a fresh Chrome profile (`pnpm build`, load dist/ + zip).

---

## 📝 Roadmap & Known Limitations

- Proofreader local path still prefers English output (Gemini Nano limitation); cloud prompt now emphasises “keep language”.
- Multimodal Prompt API hooks are stubbed for future use (images/audio).
- Automated tests currently cover Markdown rendering, PII masking, chunking and panel state; end-to-end flows remain manual.
- Cloud proxy requires your own infrastructure (sample Node proxy not bundled).

---

## 📄 License

Released under the [MIT License](LICENSE).  
Feel free to fork, adapt, and build on top of DACTI — contributions welcome!
