const CACHE_PREFIX = 'unimak_web_cache_v1_';

function getKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

export function readCache(key, fallbackValue = null, maxAgeMs = null) {
  try {
    const raw = localStorage.getItem(getKey(key));
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value') && Object.prototype.hasOwnProperty.call(parsed, 'ts')) {
      if (typeof maxAgeMs === 'number' && maxAgeMs > 0) {
        const age = Date.now() - Number(parsed.ts || 0);
        if (!Number.isFinite(age) || age > maxAgeMs) {
          return fallbackValue;
        }
      }
      return parsed.value;
    }
    // Backward compatibility for old cache format.
    return parsed;
  } catch {
    return fallbackValue;
  }
}

export function writeCache(key, value) {
  try {
    localStorage.setItem(getKey(key), JSON.stringify({ value, ts: Date.now() }));
  } catch {
    // ignore quota/storage errors
  }
}
