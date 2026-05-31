<div align="center">
  <img src="master.png" alt="MindWhisper" width="160" height="160" />
  <h1>MindWhisper</h1>
  <p><strong>Hold-to-talk dictation for macOS.</strong> Press a key, speak, release — your words appear at the cursor.</p>
  <p>
    <a href="https://mind-whisper.liveq.ai"><img src="https://img.shields.io/badge/website-mind--whisper.liveq.ai-5b9bd5" alt="Website" /></a>
    <a href="https://github.com/AllenGao6/mind-whisper/releases/latest"><img src="https://img.shields.io/github/v/release/AllenGao6/mind-whisper?label=latest&color=5b9bd5" alt="Latest release" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/platform-macOS%2011%2B-1E3A5F" alt="macOS 11+" />
  </p>
  <p><strong>🌐 <a href="https://mind-whisper.liveq.ai">mind-whisper.liveq.ai</a></strong> — see how it works and download the app.</p>
</div>

---

MindWhisper sits in your menu bar. Hold a key in any app — Slack, Gmail, your IDE — talk, release, and the transcript pastes at your cursor. Your clipboard is restored automatically, so nothing gets clobbered.

## Features

- **Three providers, one click to switch** — OpenAI Whisper, Deepgram Nova-3 (streaming), and Groq Whisper.
- **Automatic language detection** — speak any supported language; the formatter preserves it.
- **Live floating HUD** — audio meter and interim text next to your cursor as you speak.
- **Formatter presets** — Email, Slack, Bullets, or your own prompt cleans up the transcript before paste.
- **Global shortcuts** — toggle the formatter and switch presets from anywhere. All rebindable.
- **Private & local** — no accounts, no telemetry; audio goes only to the provider you choose.
- **Auto-update** — signed, notarized releases install with one click from the menu bar.

## Install

Download from **[mind-whisper.liveq.ai](https://mind-whisper.liveq.ai)** or the [Releases page](https://github.com/AllenGao6/mind-whisper/releases/latest):

1. Grab the `arm64` (Apple Silicon) or `x64` (Intel) DMG.
2. Open it and drag MindWhisper to Applications.
3. Launch — grant **Microphone**, **Accessibility**, and **Automation** when prompted.

## Providers

Open **Settings → Providers**, pick an engine, and paste an API key. One is enough to start.

| Provider | API key from | Notes |
|---|---|---|
| OpenAI Whisper | [platform.openai.com](https://platform.openai.com/api-keys) | Batch — universal fallback. |
| Deepgram | [console.deepgram.com](https://console.deepgram.com/) | WebSocket streaming, lowest latency. |
| Groq Whisper | [console.groq.com](https://console.groq.com/keys) | Very fast batch. |

## Permissions

MindWhisper needs three macOS permissions, requested on first launch: **Microphone** (record), **Accessibility** (global hotkey), and **Automation** (paste at cursor). If you deny one, re-enable it in **System Settings → Privacy & Security**, then relaunch.

## Develop

```bash
git clone https://github.com/AllenGao6/mind-whisper.git
cd mind-whisper
pnpm install
pnpm dev:desktop   # Electron app (auto-update disabled)
pnpm dev:web       # landing page at http://localhost:3000
```

Requires Node 20+, pnpm 9+, and Xcode Command Line Tools (`xcode-select --install`) for the native keyboard listener.

## License

[MIT](./LICENSE) — crafted by **[liveq.ai](https://liveq.ai)**.
