class ProviderConfigError extends Error {
  constructor(msg) { super(msg); this.name = 'ProviderConfigError'; }
}

class ProviderConnectionError extends Error {
  constructor(msg, cause) { super(msg); this.name = 'ProviderConnectionError'; this.cause = cause; }
}

module.exports = { ProviderConfigError, ProviderConnectionError };
