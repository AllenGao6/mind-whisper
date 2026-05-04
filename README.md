# MindWhisper

> Hold-to-talk dictation for macOS — global hotkey, OpenAI Whisper, auto-paste at your cursor.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS%2011%2B-blue)
![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)

MindWhisper is a tiny menu-bar app that turns your voice into text anywhere in macOS. Hold a key, talk, release — your transcribed text is pasted at the cursor. No browser tab, no second window. Just speak and it's there.

> _Add a screenshot or a short GIF demo here:_ `assets/demo.gif`

---

## Features

- **Global hold-to-talk hotkey** — works in any app (Slack, Notes, your IDE, the URL bar).
- **Auto-paste at cursor** — transcript is dropped exactly where you're typing.
- **History** — last 200 transcriptions kept locally (no cloud sync).
- **Local API key storage** — your OpenAI key never leaves your machine.
- **Menu-bar only** — no Dock clutter; one tray icon, one keyboard shortcut.
- **Audio cues** — soft chime on start/stop so you know it's listening.
- **Configurable hotkey** — pick any modifier or function key.

---

## Requirements

| Requirement | Why |
|---|---|
| **macOS 11 (Big Sur) or newer** | Uses modern `systemPreferences.isTrustedAccessibilityClient` API |
| **Node.js 18+** and **npm** | Build & run |
| **Xcode Command Line Tools** | Native build of `uiohook-napi` (`xcode-select --install`) |
| **An OpenAI API key** | Whisper transcription. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Microphone permission** | Recording audio |
| **Accessibility permission** | Listening for the global hotkey while another app is focused |

---

## Quick start (run from source)

```bash
git clone https://github.com/your-org/mind-whisper.git
cd mind-whisper
npm install
npm start
```

The app launches as a tray icon in the macOS menu bar. Click it → **Settings** → paste your OpenAI API key → **Save**. Then hold your hotkey (default: **Right Option**) anywhere on macOS, talk, and release.

> First launch will prompt for **Microphone** and **Accessibility** access. You must grant both for the hotkey-driven recording flow to work. See [macOS permissions](#macos-permissions) below.

---

## Configuration

All settings live in the app's **Settings** tab:

| Setting | Default | Notes |
|---|---|---|
| OpenAI API key | _(empty)_ | Stored locally via `electron-store`. Never transmitted except to OpenAI's transcription endpoint. |
| Hold-to-record key | Right Option | Click the key button and press any key to rebind. Modifier-only keys recommended (Option, Ctrl, Caps Lock, Fn rows). |

**Where data is stored.** `electron-store` writes to the standard Electron user-data directory:

```
~/Library/Application Support/MindWhisper/config.json
```

Delete that file to reset settings and history.

---

## macOS permissions

MindWhisper needs two permissions. macOS will prompt you on first use, but if you ever deny one, you can re-enable it manually:

1. Open **System Settings** → **Privacy & Security**.
2. **Microphone**: enable for `MindWhisper` (or `Electron` if you're running from source via `npm start`).
3. **Accessibility**: enable for the same. _Required_ for the global hotkey listener (`uiohook-napi`).

If you ran `npm start` from a terminal, you may also need to grant Accessibility to your terminal app (Terminal.app, iTerm2, Warp, etc.) — it's the parent process listening for keystrokes.

After granting, **fully quit and relaunch** the app for the new permissions to take effect.

---

## Build a distributable `.dmg`

```bash
npm run build
```

This runs `electron-builder` and produces:

```
dist/mac-arm64/MindWhisper.app
dist/MindWhisper-1.0.0-arm64.dmg
```

The default build script applies an **ad-hoc codesign** (`codesign --sign -`), which is fine for personal use and side-loading but will trigger Gatekeeper warnings on other machines. For a public release you'll want a real Apple Developer ID — see the [electron-builder code-signing docs](https://www.electron.build/code-signing).

To build for Intel Macs as well, edit `package.json` → `build.mac.target` to `["dmg"]` with both architectures, or run:

```bash
npx electron-builder --mac --x64 --arm64
```

---

## Architecture

A small, three-file Electron app:

```
main.js       Electron main process. Tray icon, global hotkey listener
              (uiohook-napi), OpenAI API calls, electron-store persistence,
              clipboard + AppleScript paste, IPC handlers.

renderer.js   Renderer process. UI logic, mic capture via Web Audio API,
              MediaRecorder → WebM, IPC to main for transcription.

preload.js    Context bridge — exposes a small whitelist of IPC methods
              under window.electronAPI to the renderer.

index.html    Single-page UI: Settings tab + History tab + status bar.
```

**IPC events** (renderer → main, defined in `preload.js`):

| Channel | Direction | Purpose |
|---|---|---|
| `transcribe` | invoke | Send audio buffer, receive transcribed text |
| `get-settings` / `save-settings` | invoke | Read/write config |
| `get-history` / `clear-history` | invoke | Read/clear transcription history |
| `set-keybind-mode` | send | Toggle "next keypress is the new hotkey" mode |
| `start-recording` / `stop-recording` / `cancel-recording` | on (main → renderer) | Hotkey state changes |
| `keybind-captured` | on (main → renderer) | New hotkey pressed during rebind |
| `switch-tab` | on (main → renderer) | Tray menu requests Settings/History tab |

**Audio path:** Web Audio API → `MediaRecorder` (WebM/Opus) → `ArrayBuffer` over IPC → temp file → OpenAI `whisper-1` → `clipboard.writeText` → AppleScript `keystroke "v" using command down`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Hotkey doesn't fire | Accessibility permission missing | System Settings → Privacy & Security → Accessibility → enable for the app (or Terminal/Electron when running from source). Restart app. |
| "Microphone access denied" in status bar | Mic permission missing | Privacy & Security → Microphone → enable. Restart app. |
| `401` from OpenAI | Bad/expired API key | Re-enter key in Settings. Test it at [platform.openai.com](https://platform.openai.com/) first. |
| `npm install` fails on `uiohook-napi` | Xcode CLT missing | `xcode-select --install` then retry. |
| Pasted text has no leading capital / strange punctuation | That's how Whisper transcribes raw audio | Speak more clearly, or build a post-processing step (PRs welcome). |
| Tray icon missing on launch | App is hidden but running | Check the menu bar near the top-right. If still missing, `pkill -f MindWhisper` and relaunch. |

---

## Contributing

Issues and pull requests are welcome.

For non-trivial changes, please open an issue first to discuss what you'd like to change. Keep PRs focused — one feature or one fix per PR.

To work on the app locally:

```bash
git clone https://github.com/your-org/mind-whisper.git
cd mind-whisper
npm install
npm start
```

There's no test suite yet; manual smoke test via `npm start` is the current bar.

---

## License

[MIT](./LICENSE) — do whatever you want, just keep the copyright notice.

---

## Acknowledgments

Crafted by the team at **[liveq.ai](https://liveq.ai)**. Transcription powered by [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text). Global keyboard hooks via [`uiohook-napi`](https://github.com/SnosMe/uiohook-napi). Built on [Electron](https://www.electronjs.org/).
