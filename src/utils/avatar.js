import sharp from "sharp";

export async function fetchAvatar(url) {
  if (!url) return null;
  try {
    const normalizedUrl = String(url).startsWith("//") ? `https:${url}` : String(url);
    if (!/^https?:\/\//i.test(normalizedUrl)) return null;
    const response = await fetch(normalizedUrl, { signal: AbortSignal.timeout(10_000), headers: { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", referer: "https://chat.zalo.me/", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 8 * 1024 * 1024) return null;
    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length || input.length > 8 * 1024 * 1024) return null;
    return await sharp(input).rotate().resize(512, 512, { fit: "cover" }).png().toBuffer();
  } catch { return null; }
}
