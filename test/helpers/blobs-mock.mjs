// In-memory stand-in for @netlify/blobs, recording which store kind was used.
export const calls = { global: 0, deploy: 0, options: [] };
const data = new Map();

function makeStore(kind, options) {
  calls[kind]++;
  calls.options.push(options);
  const prefix = kind + ':';
  return {
    async get(key, opts) {
      const raw = data.get(prefix + key);
      if (raw === undefined) return null;
      return opts && opts.type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) { data.set(prefix + key, JSON.stringify(value)); },
    async set(key, value) { data.set(prefix + key, value); },
    async delete(key) { data.delete(prefix + key); }
  };
}
export function getStore(options) { return makeStore('global', options); }
export function getDeployStore(options) { return makeStore('deploy', options); }
export function __reset() { data.clear(); calls.global = 0; calls.deploy = 0; calls.options = []; }
