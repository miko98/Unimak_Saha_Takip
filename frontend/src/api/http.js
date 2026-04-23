import { API_BASE_URL } from '../config';
import { readCache, writeCache } from './localCache';
import { enqueueWriteRequest } from './writeQueue';

const DEFAULT_NETWORK_ERROR = 'Sunucuya baglanilamadi. Ag veya API adresini kontrol edin.';
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 500;
const CACHE_KEY_PREFIX = 'http_get_';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
  );
}

export function normalizeFetchError(error, fallbackMessage = DEFAULT_NETWORK_ERROR) {
  const message = error?.message || '';
  if (message === 'Failed to fetch' || /networkerror/i.test(message)) {
    return new Error(fallbackMessage);
  }
  if (!message) {
    return new Error(fallbackMessage);
  }
  return error instanceof Error ? error : new Error(String(message));
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(url, data) {
  return new Error(data?.hata || data?.detail || `${url} basarisiz`);
}

function isGetMethod(options) {
  const method = String(options?.method || 'GET').toUpperCase();
  return method === 'GET';
}

function isWriteMethod(options) {
  const method = String(options?.method || 'GET').toUpperCase();
  return method !== 'GET' && method !== 'HEAD';
}

function toCacheKey(url) {
  return `${CACHE_KEY_PREFIX}${url}`;
}

function readHttpCache(url) {
  return readCache(toCacheKey(url), null, CACHE_MAX_AGE_MS);
}

function writeHttpCache(url, value) {
  writeCache(toCacheKey(url), value);
}

async function requestWithRetry(url, options, retryCount = DEFAULT_RETRY_COUNT, retryDelayMs = DEFAULT_RETRY_DELAY_MS) {
  let attempt = 0;
  while (true) {
    try {
      return await fetch(`${API_BASE_URL}${url}`, options);
    } catch (error) {
      if (!isLikelyNetworkError(error) || attempt >= retryCount) {
        throw normalizeFetchError(error);
      }
      attempt += 1;
      await sleep(retryDelayMs);
    }
  }
}

export async function fetchJson(url, options) {
  const shouldCache = isGetMethod(options);
  const shouldQueueWrite = isWriteMethod(options);
  try {
    const response = await requestWithRetry(url, options);
    const data = await parseJsonSafe(response);
    if (!response.ok) {
      if (shouldCache && response.status >= 500) {
        const cached = readHttpCache(url);
        if (cached != null) return cached;
      }
      throw toApiError(url, data);
    }
    if (shouldCache) {
      writeHttpCache(url, data);
    }
    return data;
  } catch (error) {
    if (shouldQueueWrite) {
      const queued = enqueueWriteRequest(url, options);
      if (queued) return { queued: true, offline: true };
    }
    if (shouldCache) {
      const cached = readHttpCache(url);
      if (cached != null) return cached;
    }
    throw error;
  }
}

export async function fetchJsonWithFallback(urls, options) {
  const shouldCache = isGetMethod(options);
  const shouldQueueWrite = isWriteMethod(options);
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await requestWithRetry(url, options);
      const data = await parseJsonSafe(response);
      if (response.ok) {
        if (shouldCache) writeHttpCache(url, data);
        return { response, data };
      }
      lastError = toApiError(url, data);
    } catch (error) {
      lastError = normalizeFetchError(error);
    }
  }
  if (shouldCache) {
    for (const url of urls) {
      const cached = readHttpCache(url);
      if (cached != null) {
        return { response: { ok: true, status: 200, fromCache: true }, data: cached };
      }
    }
  }
  if (shouldQueueWrite && Array.isArray(urls) && urls.length > 0) {
    const queued = enqueueWriteRequest(urls[0], options);
    if (queued) return { response: { ok: true, status: 202, queued: true }, data: { queued: true, offline: true } };
  }
  throw lastError || new Error(DEFAULT_NETWORK_ERROR);
}
