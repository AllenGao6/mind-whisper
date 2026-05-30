const OpenAI = require('openai');
const { toFile } = require('openai');
const { ProviderConfigError } = require('./provider');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = 'whisper-large-v3-turbo';

async function transcribeBatch({ apiKey, wavBuffer, model = GROQ_DEFAULT_MODEL, language }) {
  if (!apiKey) throw new ProviderConfigError('Groq API key not set');
  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const file = await toFile(Buffer.from(wavBuffer), 'audio.wav', { type: 'audio/wav' });
  const params = { model, file };
  if (language && language !== 'auto') params.language = language;
  const result = await client.audio.transcriptions.create(params);
  return result.text || '';
}

function createSession({ apiKey, language, hooks }) {
  let wavBuf = null;
  return {
    mode: 'batch',
    sendPcm() {},
    sendBatch(buffer) { wavBuf = buffer; },
    async finish() {
      try {
        const text = await transcribeBatch({ apiKey, wavBuffer: wavBuf, language });
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
