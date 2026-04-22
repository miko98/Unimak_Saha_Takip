import { API_BASE_URL } from '../config';

let patched = false;
let refreshPromise = null;

function readAuth() {
  try {
    return JSON.parse(localStorage.getItem('unimak_auth') || 'null');
  } catch {
    return null;
  }
}

function writeAuth(nextAuth) {
  localStorage.setItem('unimak_auth', JSON.stringify(nextAuth));
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const auth = readAuth();
    const refreshToken = auth?.refreshToken;
    if (!refreshToken) return null;

    const formData = new FormData();
    formData.append('refresh_token', refreshToken);

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) return null;

    const data = await response.json();
    const accessToken = data?.access_token;
    if (!accessToken) return null;

    const nextAuth = { ...auth, accessToken };
    writeAuth(nextAuth);
    return accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function installAuthFetchPatch(onPolicySignal) {
  if (patched) return;
  patched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const shouldAttachToken = requestUrl.startsWith(API_BASE_URL);
    if (!shouldAttachToken) {
      return originalFetch(input, init);
    }

    // Refresh endpoint'inde tekrar refresh denemesine girme.
    if (requestUrl.startsWith(`${API_BASE_URL}/auth/refresh`)) {
      return originalFetch(input, init);
    }

    const auth = readAuth();
    let token = auth?.accessToken || null;

    if (!token) {
      return originalFetch(input, init);
    }

    const withAuthHeaders = (accessToken) => {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
      return headers;
    };

    let response = await originalFetch(input, {
      ...init,
      headers: withAuthHeaders(token),
    });
    const maintenance = response.headers.get('x-maintenance') === '1';
    const forceUpdate = response.headers.get('x-force-update') === '1' || response.status === 426;
    const minVersion = response.headers.get('x-min-version') || null;
    if (typeof onPolicySignal === 'function') {
      onPolicySignal({ maintenance, forceUpdate, minVersion });
    }

    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      localStorage.removeItem('unimak_auth');
      return response;
    }

    response = await originalFetch(input, {
      ...init,
      headers: withAuthHeaders(refreshedToken),
    });
    return response;
  };
}

