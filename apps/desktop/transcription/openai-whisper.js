const OpenAI = require('openai');
const { toFile } = require('openai');
const { ProviderConfigError } = require('./provider');

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini-transcribe';

async function transcribeBatch({ apiKey, wavBuffer, language }) {
  if (!apiKey) throw new ProviderConfigError('OpenAI API key not set');
  const openai = new OpenAI({ apiKey });
  const file = await toFile(Buffer.from(wavBuffer), 'audio.wav', { type: 'audio/wav' });
  const params = { model: OPENAI_DEFAULT_MODEL, file };
  if (language && language !== 'auto') params.language = language;
  const result = await openai.audio.transcriptions.create(params);
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

module.exports = { createSession, transcribeBatch, OPENAI_DEFAULT_MODEL };
