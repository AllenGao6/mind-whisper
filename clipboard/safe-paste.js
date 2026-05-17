const { clipboard, Notification } = require('electron');
const { exec } = require('child_process');

const RESTORE_DELAY_MS = 600;

function notifyPasteFailed(msg) {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'MindWhisper — Paste failed',
        body: `${msg} Transcript is still on your clipboard (Cmd+V to paste manually).`,
      }).show();
    }
  } catch (_) {}
}

function safePaste(text) {
  const original = clipboard.readText();
  clipboard.writeText(text);

  exec(
    `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
    (err) => {
      if (err) {
        // Don't restore — leave the transcript on the clipboard so the user can paste it.
        console.error('[safePaste] osascript failed:', err.message || err);
        notifyPasteFailed(err.message || 'osascript error');
        return;
      }
      setTimeout(() => {
        // Only restore if the transcript is still in clipboard (user might have copied something else).
        if (clipboard.readText() === text) {
          clipboard.writeText(original);
        }
      }, RESTORE_DELAY_MS);
    }
  );
}

module.exports = { safePaste };
