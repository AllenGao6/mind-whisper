const WebSocket = require('ws');
const { ProviderConfigError, ProviderConnectionError } = require('./provider');

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

function buildUrl({ model = 'nova-3', sampleRate = 16000, language = 'auto' }) {
  // 'auto' → 'multi' (nova-3 code-switching detection); a specific ISO code is
  // passed through so the user can force a single language.
  const dgLanguage = (!language || language === 'auto') ? 'multi' : language;
  const params = new URLSearchParams({
    model,
    language: dgLanguage,
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    channels: '1',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    endpointing: '300',
  });
  return `${DEEPGRAM_WS_URL}?${params.toString()}`;
}

function createSession({ apiKey, model = 'nova-3', sampleRate = 16000, language = 'auto', hooks }) {
  if (!apiKey) throw new ProviderConfigError('Deepgram API key not set');

  const url = buildUrl({ model, sampleRate, language });
  const ws = new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  const pending = [];
  let isOpen = false;
  let isClosed = false;
  const finals = [];
  let currentInterim = '';
  let finishResolver = null;
  let finishRejecter = null;
  let finalizeSent = false;

  ws.on('open', () => {
    isOpen = true;
    while (pending.length) {
      const buf = pending.shift();
      try { ws.send(buf); } catch (_) {}
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'Results') {
      const alt = msg.channel?.alternatives?.[0];
      const text = alt?.transcript;
      if (!text) return;
      if (msg.is_final) {
        finals.push(text);
        currentInterim = '';
        hooks?.onFinal?.(text);
        hooks?.onPartial?.('', finals.slice());
      } else {
        currentInterim = text;
        hooks?.onPartial?.(currentInterim, finals.slice());
      }
    } else if (msg.type === 'SpeechStarted') {
      // ignore
    } else if (msg.type === 'UtteranceEnd') {
      // ignore
    } else if (msg.type === 'Error') {
      hooks?.onError?.(new ProviderConnectionError(msg.message || 'Deepgram error'));
    }
  });

  ws.on('error', (err) => {
    if (!isOpen) {
      // connection-time error
      if (finishRejecter) finishRejecter(new ProviderConnectionError('Deepgram WebSocket failed', err));
      hooks?.onError?.(new ProviderConnectionError('Deepgram WebSocket failed', err));
    } else {
      hooks?.onError?.(new ProviderConnectionError('Deepgram WebSocket error', err));
    }
  });

  ws.on('close', () => {
    isClosed = true;
    const combined = finals.join(' ').trim();
    hooks?.onClosed?.(combined);
    if (finishResolver) finishResolver(combined);
  });

  return {
    mode: 'stream',
    sendPcm(int16Buffer) {
      if (isClosed) return;
      if (!isOpen) { pending.push(Buffer.from(int16Buffer)); return; }
      try { ws.send(Buffer.from(int16Buffer)); } catch (_) {}
    },
    sendBatch() {},
    async finish() {
      return new Promise((resolve, reject) => {
        finishResolver = resolve;
        finishRejecter = reject;
        if (isClosed) {
          resolve(finals.join(' ').trim());
          return;
        }
        const flush = () => {
          try {
            if (!finalizeSent) {
              ws.send(JSON.stringify({ type: 'Finalize' }));
              finalizeSent = true;
            }
            setTimeout(() => {
              try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch (_) {}
            }, 250);
          } catch (_) {}
        };
        if (isOpen) flush();
        else ws.once('open', flush);
        // Safety: resolve after 8s if close never fires (slow networks + Deepgram queueing).
        setTimeout(() => {
          if (!isClosed) {
            const combined = finals.join(' ').trim();
            isClosed = true;
            try { ws.terminate(); } catch (_) {}
            resolve(combined);
          }
        }, 8000);
      });
    },
    cancel() {
      try { ws.terminate(); } catch (_) {}
      isClosed = true;
    },
  };
}

module.exports = { createSession, buildUrl };
