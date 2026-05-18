const OpenAI = require('openai');
const { toFile } = require('openai');
const { ProviderConfigError } = require('./provider');

async function transcribeBatch({ apiKey, wavBuffer }) {
  if (!apiKey) throw new ProviderConfigError('OpenAI API key not set');
  const openai = new OpenAI({ apiKey });
  const file = await toFile(Buffer.from(wavBuffer), 'audio.wav', { type: 'audio/wav' });
  const result = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  });
  return result.text || '';
}

function createSession({ apiKey, hooks }) {
  let wavBuf = null;
  return {
    mode: 'batch',
    sendPcm() {},
    sendBatch(buffer) { wavBuf = buffer; },
    async finish() {
      try {
        const text = await transcribeBatch({ apiKey, wavBuffer: wavBuf });
        hooks?.onFinal?.(text);
        hooks?.onClosed?.(text);
        return text;
      } catch (err) {
        hooks?.onError?.(err);
        throw err;
      }
    },
    cancel() {},
  };
}

module.exports = { createSession, transcribeBatch };
