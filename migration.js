function runMigrations(store) {
  if (store.has('apiKey') && !store.has('providers')) {
    const legacy = store.get('apiKey') || '';
    store.set('providers', {
      openai: { apiKey: legacy },
      deepgram: { apiKey: '', model: 'nova-3' },
      groq: { apiKey: '' },
    });
    if (!store.has('activeProvider')) store.set('activeProvider', 'openai');
    store.delete('apiKey');
  }

  if (!store.has('providers')) {
    store.set('providers', {
      openai: { apiKey: '' },
      deepgram: { apiKey: '', model: 'nova-3' },
      groq: { apiKey: '' },
    });
  }
  if (!store.has('activeProvider')) {
    store.set('activeProvider', 'openai');
  }

  // Formatter chord shortcuts — keycode 33 = letter F, modifiers Cmd+Shift.
  if (!store.has('chordToggle')) {
    store.set('chordToggle', { keycode: 33, modifiers: { meta: true, shift: true, ctrl: false, alt: false } });
  }
  if (!store.has('chordDigitModifiers')) {
    store.set('chordDigitModifiers', { meta: true, shift: true, ctrl: false, alt: false });
  }
}

module.exports = { runMigrations };
