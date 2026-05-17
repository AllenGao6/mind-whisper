<div align="center">
  <img src="asset/icon.png" alt="MindWhisper" width="160" height="160" />
  <h1>MindWhisper</h1>
  <p><strong>Hold-to-talk dictation for macOS.</strong> Press a key, speak, release — your words appear at the cursor.</p>
  <p>
    <a href="https://github.com/AllenGao6/mind-whisper/releases/latest"><img src="https://img.shields.io/github/v/release/AllenGao6/mind-whisper?label=latest&color=5b9bd5" alt="Latest release" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/platform-macOS%2011%2B-1E3A5F" alt="macOS 11+" />
    <img src="https://img.shields.io/badge/electron-33-47848F" alt="Electron 33" />
  </p>
</div>

---

MindWhisper sits in your menu bar. Hold the configured key in any app — Slack, Gmail, your IDE, Spotlight — talk, release, and the transcript pastes where your cursor is. A small bubble floats next to your cursor while you speak. Your clipboard contents are restored automatically after the paste, so nothing is clobbered.

## Highlights

- **Three transcription providers, one click to switch** — OpenAI Whisper, **Deepgram Nova-3** (streaming, lowest latency), and Groq Whisper (fast batch).
- **Automatic language detection** — Deepgram nova-3 multi-language; Whisper / Groq auto-detect; formatter preserves the original language.
- **Live floating HUD** near the cursor — audio meter, interim text as you speak, formatted output before paste.
- **Formatter presets** (Email, Slack, Bullets, or your own) — GPT-4o-mini cleans up the transcript before paste. Streams live into the HUD.
- **Global chord shortcuts** to toggle the formatter (`Cmd+Shift+F`) and switch presets (`Cmd+Shift+1…9`, `Cmd+Shift+0` to disable). All rebindable.
- **Clipboard-safe paste** — your previous clipboard contents are restored automatically.
- **Auto-update** — signed, notarized releases ship via GitHub Releases; the app downloads new versions in the background and offers a one-click install in the menu bar.
- **Robust by design** — watchdog timers recover from stuck recordings, sleep/wake handling, deferred hotkey changes during recording, never blocks indefinitely on slow networks.

## Install

### From a signed release (recommended)

1. Download the latest `MindWhisper-x.y.z-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) from the [Releases page](https://github.com/AllenGao6/mind-whisper/releases/latest).
2. Open the DMG and drag MindWhisper into your Applications folder.
3. Launch it. macOS will ask for **Accessibility** and **Microphone** permissions on first run — grant both.

### From source

```bash
git clone https://github.com/AllenGao6/mind-whisper.git
cd mind-whisper
npm install
npm start
```

You'll need **Node.js 18+**, **Xcode Command Line Tools** (`xcode-select --install`) for the native keyboard listener, and at least one provider API key (see below).

## Configure

Click the menu-bar icon → **Settings** to set:

- **Hold-to-Record Key** (default: Right Option). Click to rebind to any key.
- **Formatter Shortcuts** — defaults are `Cmd+Shift+F` to toggle, `Cmd+Shift+1…9 / 0` to switch presets. Rebind either with the capture buttons.

Click **Providers** to choose which transcription engine is active and paste your API key(s).

| Provider | API key from | Notes |
|---|---|---|
| OpenAI Whisper | [platform.openai.com](https://platform.openai.com/api-keys) | Batch. Universal fallback for streaming-provider failures. |
| **Deepgram** | [console.deepgram.com](https://console.deepgram.com/) | **WebSocket streaming**, lowest latency. Default streaming choice. |
| Groq Whisper | [console.groq.com](https://console.groq.com/keys) | Very fast batch. Drop-in alternative when Deepgram isn't an option. |

Click **Formatter** to enable post-processing, pick a default preset, or write your own. Custom prompts can be in any language — the formatter is instructed to preserve the input language.

## Daily use

| Action | How |
|---|---|
| Dictate | Hold the talk key, speak, release. The bubble next to your cursor shows interim text (Deepgram) or a level meter (batch providers). |
| Toggle formatter on / off | `Cmd+Shift+F` (rebindable) |
| Jump to preset 1–9 | `Cmd+Shift+1` … `Cmd+Shift+9` — also enables the formatter |
| Disable formatter | `Cmd+Shift+0` |
| Open settings | Click the menu-bar icon → Settings |
| Install pending update | Click the menu-bar icon → ↑ Install update (appears when available) |

## Permissions

MindWhisper needs three macOS permissions:

1. **Microphone** — to record your voice.
2. **Accessibility** — to listen for the global hotkey while another app is focused.
3. **Automation** (System Events) — to send the `Cmd+V` keystroke that pastes the transcript at your cursor. The app triggers this prompt at launch so it doesn't race the first dictation.

If you ever deny one, re-enable it in **System Settings → Privacy & Security**, then fully quit and relaunch.

## How it works

```
Keydown (uiohook-napi)
       │
       ▼
Renderer captures audio via AudioWorklet @ 16 kHz
       │
       ├──► PCM frames stream to Deepgram WebSocket  ─── interim partials ──► HUD
       │
       │    (or buffered into WAV for OpenAI / Groq batch on stop)
       │
Keyup
       │
       ▼
finalizeRecording  →  formatter (gpt-4o-mini stream, optional)
       │
       ▼
safePaste:  snapshot clipboard → write transcript → Cmd+V → restore clipboard
```

Source layout:

```
main.js                  Electron main: hotkey, HUD window, provider routing,
                         clipboard, auto-updater, tray, IPC handlers.
renderer.js              Settings UI, AudioWorklet capture pipeline.
hud.html / hud-*.js      Floating cursor-pinned HUD window.
preload.js               Context bridge — narrow IPC surface.
transcription/           Provider abstraction: openai, deepgram, groq + factory.
audio/                   AudioWorklet processor + WAV synthesis.
clipboard/safe-paste.js  Snapshot → paste → restore.
migration.js             electron-store schema migrations.
.github/workflows/       Signed + notarized release pipeline.
```

## Build & release

For local unsigned builds:

```bash
npm run build      # builds the DMG, does NOT publish
```

For signed + notarized releases published to GitHub:

```bash
npm version patch  # bumps version, commits, tags
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which on a macOS runner:

1. Decodes your Developer ID Application `.p12` from a base64 secret.
2. Builds DMG + ZIP for `arm64` and `x64`.
3. Signs with hardened runtime; notarizes via Apple's `notarytool`.
4. Publishes everything (plus `latest-mac.yml` for the auto-updater) to a draft GitHub Release.

Required GitHub Actions secrets (`Settings → Secrets and variables → Actions`):

| Secret | Where to get it |
|---|---|
| `APPLE_ID` | Your Apple Developer email |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → App-Specific Passwords |
| `APPLE_TEAM_ID` | developer.apple.com → Membership Details |
| `MAC_CERTIFICATE_P12_BASE64` | `base64 -i cert.p12 \| pbcopy` after exporting from Keychain |
| `MAC_CERTIFICATE_PASSWORD` | The password you set during `.p12` export |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Hotkey doesn't fire | Accessibility permission missing | System Settings → Privacy & Security → Accessibility → enable for MindWhisper (or your terminal app, when running from source). Quit and relaunch. |
| First paste does nothing after install | macOS Automation permission dialog raced the keystroke | Grant System Events automation when prompted at launch; subsequent pastes work. |
| Transcript appears in clipboard but doesn't paste | Automation permission denied | System Settings → Privacy & Security → Automation → MindWhisper → enable "System Events". |
| Recording stuck on "Transcribing…" | Stalled network call | The watchdog auto-recovers within ~25–60 s and notifies. If it persists, restart the app. |
| HUD bubble doesn't appear | macOS reset its always-on-top flag during sleep | Bubble re-creates itself on next recording; if not, restart the app. |
| `npm install` fails on `uiohook-napi` | Xcode CLT missing | `xcode-select --install`, then retry. |
| Auto-update never fires | Running from source, or running an unsigned build | Auto-updater only runs in signed packaged builds. Install via DMG. |

## Contributing

PRs welcome for bug fixes and small features. For larger work, please open an issue first — keeping this app small and focused is a feature.

```bash
git clone https://github.com/AllenGao6/mind-whisper.git
cd mind-whisper
npm install
npm start          # launch in dev mode (auto-update disabled)
```

There's no test suite yet; manual smoke test via the matrix in `verification` sections of the plan files is the current bar.

## License

[MIT](./LICENSE) — do whatever you want, just keep the copyright notice.

## Credits

Crafted by **[liveq.ai](https://liveq.ai)**. Transcription by [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text), [Deepgram](https://deepgram.com/), and [Groq](https://groq.com/). Global keyboard hooks via [`uiohook-napi`](https://github.com/SnosMe/uiohook-napi). Auto-update via [`electron-updater`](https://www.electron.build/auto-update). Built on [Electron](https://www.electronjs.org/).
