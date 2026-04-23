const QUEUE_KEY = 'unimak_web_write_queue_v1';

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export function getQueuedWriteCount() {
  return readQueue().length;
}

function toSerializableBody(body) {
  if (!body) return { bodyType: 'empty', bodyPayload: null };
  if (body instanceof FormData) {
    const entries = [];
    for (const [k, v] of body.entries()) {
      if (v instanceof Blob || v instanceof File) {
        return null;
      }
      entries.push([k, String(v)]);
    }
    return { bodyType: 'form', bodyPayload: entries };
  }
  if (typeof body === 'string') {
    return { bodyType: 'text', bodyPayload: body };
  }
  if (typeof body === 'object') {
    try {
      return { bodyType: 'json', bodyPayload: JSON.stringify(body) };
    } catch {
      return null;
    }
  }
  return null;
}

function fromSerializableBody(item) {
  if (item.bodyType === 'empty') return undefined;
  if (item.bodyType === 'form') {
    const formData = new FormData();
    for (const [k, v] of item.bodyPayload || []) {
      formData.append(k, v);
    }
    return formData;
  }
  if (item.bodyType === 'text') return item.bodyPayload || '';
  if (item.bodyType === 'json') {
    return item.bodyPayload || '{}';
  }
  return undefined;
}

export function enqueueWriteRequest(url, options = {}) {
  const method = String(options.method || 'POST').toUpperCase();
  const serial = toSerializableBody(options.body);
  if (!serial) return false;
  const queue = readQueue();
  queue.push({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    url,
    method,
    bodyType: serial.bodyType,
    bodyPayload: serial.bodyPayload,
    createdAt: Date.now(),
  });
  saveQueue(queue);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('unimak-write-queue-changed'));
  }
  return true;
}

export async function flushQueuedWrites(fetcher) {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };
  const remaining = [];
  let flushed = 0;
  for (const item of queue) {
    try {
      const body = fromSerializableBody(item);
      const headers = item.bodyType === 'json' ? { 'Content-Type': 'application/json' } : undefined;
      const response = await fetcher(item.url, { method: item.method, body, headers });
      if (!response.ok) {
        // Hard fail (4xx) -> kuyruktan düşür; soft fail (5xx) -> kuyrukta tut.
        if (response.status >= 500) remaining.push(item);
        else flushed += 1;
      } else {
        flushed += 1;
      }
    } catch {
      remaining.push(item);
    }
  }
  saveQueue(remaining);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('unimak-write-queue-changed'));
  }
  return { flushed, remaining: remaining.length };
}
