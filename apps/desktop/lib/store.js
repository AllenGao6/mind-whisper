// Drop-in replacement for the subset of `electron-store` we actually use
// (`get / set / has / delete`, plus a `defaults` constructor option).
//
// Why we wrote our own: in our pnpm-workspace + electron-builder build, the
// transitive dependencies of `electron-store` (conf → pkg-up → find-up →
// locate-path → p-locate → p-limit) were not bundled into app.asar because
// electron-builder's tree walker doesn't traverse outside the workspace's
// own node_modules — and pnpm with shamefully-hoist=true placed those deps
// at the workspace root only. The packaged app crashed at launch with
// "Cannot find module 'p-limit'". Replacing electron-store removes the
// deep transitive chain at the source.
//
// On-disk format is **identical** to electron-store's default:
//   ~/Library/Application Support/<productName>/config.json
// So existing user configs migrate transparently — no version upgrade needed.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

class Store {
  constructor({ defaults } = {}) {
    this._path = path.join(app.getPath('userData'), 'config.json');
    this._defaults = defaults || {};
    this._load();
  }

  _load() {
    try {
      this._data = JSON.parse(fs.readFileSync(this._path, 'utf8'));
      if (this._data === null || typeof this._data !== 'object' || Array.isArray(this._data)) {
        this._data = {};
      }
    } catch (_) {
      this._data = {};
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this._path), { recursive: true });
      const tmp = this._path + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2));
      // Atomic on POSIX: the rename either fully replaces or doesn't,
      // so config.json is never observed half-written.
      fs.renameSync(tmp, this._path);
    } catch (err) {
      console.error('[store] save failed:', err && err.message);
    }
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this._data, key);
  }

  get(key) {
    if (this.has(key)) return this._data[key];
    return this._defaults[key];
  }

  set(keyOrObj, value) {
    // electron-store supports two shapes: set(key, value) and set(object).
    if (keyOrObj && typeof keyOrObj === 'object' && !Array.isArray(keyOrObj)) {
      Object.assign(this._data, keyOrObj);
    } else {
      this._data[keyOrObj] = value;
    }
    this._save();
  }

  delete(key) {
    delete this._data[key];
    this._save();
  }
}

module.exports = Store;
