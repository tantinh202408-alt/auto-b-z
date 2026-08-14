import sharp from "sharp";

const avatarCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 500;

function cleanCacheIfNeeded() {
  if (avatarCache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, val] of avatarCache.entries()) {
    if (now - val.time > CACHE_TTL_MS || avatarCache.size > MAX_CACHE_ENTRIES) {
      avatarCache.delete(key);
    }
  }
}

export async function fetchAvatar(url) {
  if (!url) return null;
  const normalizedUrl = String(url).startsWith("//") ? `https:${url}` : String(url);
  if (!/^https?:\/\//i.test(normalizedUrl)) return null;

  const now = Date.now();
  const cached = avatarCache.get(normalizedUrl);
  if (cached && now - cached.time < CACHE_TTL_MS) {
    return cached.buffer;
  }

  if (inFlightRequests.has(normalizedUrl)) {
    return inFlightRequests.get(normalizedUrl);
  }

  const promise = (async () => {
    try {
      const response = await fetch(normalizedUrl, {
        signal: AbortSignal.timeout(2500),
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          referer: "https://chat.zalo.me/",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!response.ok) return null;
      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > 8 * 1024 * 1024) return null;
      const input = Buffer.from(await response.arrayBuffer());
      if (!input.length || input.length > 8 * 1024 * 1024) return null;

      const buffer = await sharp(input)
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .png({ compressionLevel: 4 })
        .toBuffer();

      cleanCacheIfNeeded();
      avatarCache.set(normalizedUrl, { buffer, time: Date.now() });
      return buffer;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(normalizedUrl);
    }
  })();

  inFlightRequests.set(normalizedUrl, promise);
  return promise;
}

