const openai = require('./openai-whisper');
const groq = require('./groq-whisper');
const deepgram = require('./deepgram');
const { ProviderConfigError } = require('./provider');

function createSession({ providerId, providersConfig, language = 'auto', hooks }) {
  const cfg = providersConfig?.[providerId];
  if (!cfg) throw new ProviderConfigError(`Unknown provider: ${providerId}`);
  switch (providerId) {
    case 'openai':
      return openai.createSession({ apiKey: cfg.apiKey, language, hooks });
    case 'groq':
      return groq.createSession({ apiKey: cfg.apiKey, language, hooks });
    case 'deepgram':
      return deepgram.createSession({
        apiKey: cfg.apiKey,
        model: cfg.model || 'nova-3',
        language,
        hooks,
      });
    default:
      throw new ProviderConfigError(`Unknown provider: ${providerId}`);
  }
}

module.exports = { createSession, ProviderConfigError };
