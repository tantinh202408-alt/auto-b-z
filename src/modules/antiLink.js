import sharp from "sharp";
import jsQR from "jsqr";

const DIRECT_URL_RE = /(?:https?|hxxps?|ftp):\/\/[^\s]+|www\.[a-z0-9-]+\.[a-z]{2,}|(?:chat\.)?zalo\.me(?:\/[^\s]*)?/iu;
const DOMAIN_RE = /(?:^|[^\p{L}\p{N}_-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\s*(?:\.|\[\.\]|\(\.\)|\s+dot\s+)\s*)+(?:com|net|org|io|me|app|dev|xyz|site|online|info|biz|co|vn|cc|tv|gg|link|top|shop|cloud)(?=$|[\s/:?#),!])/iu;
const MEDIA_KEY_RE = /(?:thumb|thumbnail|image|photo|picture|preview|avatar|icon|src)/i;
const IMAGE_URL_RE = /^https?:\/\//i;

function collectStrings(value, output = [], depth = 0, key = "content") {
  if (depth > 5 || value == null) return output;
  if (typeof value === "string") output.push({ key, value });
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output, depth + 1, key));
  else if (typeof value === "object") Object.entries(value).forEach(([childKey, item]) => collectStrings(item, output, depth + 1, childKey));
  return output;
}

export function containsLink(content, data = {}) {
  const messageType = String(data.msgType || data.type || "").toLowerCase();
  // href/src của tin ảnh là URL CDN nội bộ. Ảnh chỉ bị chặn khi QR giải mã ra link thật.
  if (/(?:photo|image|gif|sticker)/.test(messageType)) return false;
  const visible = [];
  if (typeof content === "string") visible.push(content);
  else if (content && typeof content === "object") {
    for (const key of ["title", "description", "text", "msg", "href", "link", "url"]) {
      if (typeof content[key] === "string" && !(MEDIA_KEY_RE.test(key) && IMAGE_URL_RE.test(content[key]))) visible.push(content[key]);
    }
  }
  for (const key of ["href", "link", "url"]) if (typeof data[key] === "string") visible.push(data[key]);
  const searchable = visible.join(" \n ").trim();
  return Boolean(searchable && (DIRECT_URL_RE.test(searchable) || DOMAIN_RE.test(searchable)));
}

export function findImageUrls(data = {}) {
  const messageType = String(data.msgType || data.type || "").toLowerCase();
  const isMediaMessage = /(?:photo|image|gif)/.test(messageType);
  return [...new Set(collectStrings(data)
    .filter(({ key, value }) => IMAGE_URL_RE.test(value) && (MEDIA_KEY_RE.test(key) || (isMediaMessage && /^(?:href|url)$/i.test(key))))
    .map(({ value }) => value))].slice(0, 3);
}

async function decodeQrFromUrl(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") || "";
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (!type.startsWith("image/") || declaredSize > 8 * 1024 * 1024) return null;
  const input = Buffer.from(await response.arrayBuffer());
  if (input.length > 8 * 1024 * 1024) return null;
  const { data: pixels, info } = await sharp(input).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(pixels), info.width, info.height, { inversionAttempts: "attemptBoth" })?.data || null;
}

export async function containsQrLink(data = {}, logger = null) {
  for (const url of findImageUrls(data)) {
    try {
      const decoded = await decodeQrFromUrl(url);
      if (decoded && containsLink(decoded)) return decoded;
    } catch (error) { logger?.debug("Không quét được QR trong ảnh", { message: error.message }); }
  }
  return null;
}

export async function enforceAntiLink(ctx) {
  const textLink = containsLink(ctx.rawContent ?? ctx.content, ctx.message.data);
  const qrLink = textLink ? null : await containsQrLink(ctx.message.data, ctx.logger);
  if (!textLink && !qrLink) return false;
  if (await ctx.isPrivileged(ctx.senderId)) {
    ctx.logger.info("Anti-link bỏ qua người có quyền", { userId: ctx.senderId, groupId: ctx.threadId });
    return false;
  }
  ctx.logger.warn("Anti-link phát hiện liên kết", { userId: ctx.senderId, groupId: ctx.threadId, msgType: ctx.message.data.msgType, source: qrLink ? "qr-image" : "message" });
  const deleted = await ctx.safeDelete(ctx.message);
  await ctx.warnUser("LINK", deleted ? "Bạn không được gửi link trong nhóm" : "Phát hiện link nhưng bot không đủ quyền xóa tin");
  return true;
}
