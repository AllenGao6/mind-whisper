const OpenAI = require('openai');
const { toFile } = require('openai');
const { ProviderConfigError } = require('./provider');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = 'whisper-large-v3-turbo';

async function transcribeBatch({ apiKey, wavBuffer, model = GROQ_DEFAULT_MODEL }) {
  if (!apiKey) throw new ProviderConfigError('Groq API key not set');
  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const file = await toFile(Buffer.from(wavBuffer), 'audio.wav', { type: 'audio/wav' });
  const result = await client.audio.transcriptions.create({ model, file });
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

module.exports = { createSession, transcribeBatch, GROQ_BASE_URL, GROQ_DEFAULT_MODEL };
