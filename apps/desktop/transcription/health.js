// Provider health cache and probes.
//
// Purpose: fail FAST when a provider key is invalid or its endpoint is
// unreachable, BEFORE the user starts dictating. Without this, the user
// can speak a whole sentence before `session.finish()` throws.
//
// Strategy:
//   - One probe per provider that auth-checks the cheapest endpoint.
//   - For Deepgram (streaming/WS) the REST auth check is paired with a brief
//     WS handshake to verify the streaming path is reachable too.
//   - Results live in an in-memory cache only (never persisted): rebuilt on
//     every app boot, kept fresh by periodic refreshes + invalidate-on-failure.
//   - 2 s hard timeout per probe so a slow network never holds up the loop.

const PROBE_TIMEOUT_MS = 2000;
const STALE_MS = 5 * 60 * 1000;  // 5 min — UX cadence chosen during planning
const WS_HANDSHAKE_MS = 500;     // Deepgram WS open-or-bust window

// providerId → { healthy: boolean, lastCheck: number, error: string | null }
const cache = new Map();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('probe timeout')), ms)),
  ]);
}

async function probeOpenAI(apiKey) {
  if (!apiKey) throw new Error('no api key');
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function probeGroq(apiKey) {
  if (!apiKey) throw new Error('no api key');
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function probeDeepgram(apiKey) {
  if (!apiKey) throw new Error('no api key');
  // REST auth check first — cheapest "is the key accepted?" signal.
  const res = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // WS handshake check — REST auth ≠ streaming entitlement. A user can have
  // a valid key but a firewall blocking WSS, or be on a tier without streaming.
  // We only care that the upgrade succeeds; immediately close.
  const WebSocket = require('ws');
  await new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(
      'wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000',
      { headers: { Authorization: `Token ${apiKey}` } }
    );
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch (_) {}
      reject(new Error('ws handshake timeout'));
    }, WS_HANDSHAKE_MS);
    ws.once('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try { ws.close(); } catch (_) {}
      resolve();
    });
    ws.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(err);
    });
  });
}

const PROBES = { openai: probeOpenAI, groq: probeGroq, deepgram: probeDeepgram };

async function probe(providerId, apiKey) {
  const fn = PROBES[providerId];
  if (!fn) return { healthy: false, error: 'unknown provider' };
  try {
    await withTimeout(fn(apiKey), PROBE_TIMEOUT_MS);
    return { healthy: true, error: null };
  } catch (err) {
    return { healthy: false, error: (err && err.message) || 'probe failed' };
  }
}

// Run a probe and store the result. Returns the new entry.
async function refresh(providerId, apiKey) {
  const result = await probe(providerId, apiKey);
  cache.set(providerId, { ...result, lastCheck: Date.now() });
  return result;
}

// Read cache without probing. Returns null if no entry exists (caller should
// treat cache-miss as optimistic — let the recording proceed; an in-flight
// refresh will populate accurate data for the next press).
function get(providerId) {
  return cache.get(providerId) || null;
}

function isFresh(providerId) {
  const entry = cache.get(providerId);
  return !!entry && (Date.now() - entry.lastCheck) < STALE_MS;
}

// Drop a cache entry. Used after an actual recording fails — we don't trust
// the stale "healthy" mark anymore; let the next probe sort it out.
function invalidate(providerId) {
  cache.delete(providerId);
}

module.exports = { refresh, get, isFresh, invalidate };
