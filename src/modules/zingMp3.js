import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const URL_API = "https://zingmp3.vn";
const API_KEY = "88265e23d4284f25963e6eedac8fbfa3";
const SECRET_KEY = "2aa2d1c561e809b267f3638c4a307aab";
const VERSION = "1.6.40";

function getHash256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getHmac512(str, key) {
  return crypto.createHmac("sha512", key).update(Buffer.from(str, "utf-8")).digest("hex");
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export class ZingMp3Service {
  constructor(root = process.cwd()) {
    this.tmpDir = path.join(root, "tmp");
    this.sessionCache = new Map(); // key: `${threadId}:${senderId}` -> { songs, expireAt }
    fs.mkdir(this.tmpDir, { recursive: true }).catch(() => {});
  }

  hashHasIdSignature(apiPath, id, ctime) {
    return getHmac512(
      apiPath + getHash256(`ctime=${ctime}id=${id}version=${VERSION}`),
      SECRET_KEY
    );
  }

  hashNoIdSignature(apiPath, ctime) {
    return getHmac512(
      apiPath + getHash256(`ctime=${ctime}version=${VERSION}`),
      SECRET_KEY
    );
  }

  async getCookie() {
    try {
      const response = await fetch(URL_API, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      const rawCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
      return rawCookies.map((c) => c.split(";")[0]).join("; ");
    } catch {
      return "";
    }
  }

  async requestZing(apiPath, params = {}) {
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = params.id
      ? this.hashHasIdSignature(apiPath, params.id, ctime)
      : this.hashNoIdSignature(apiPath, ctime);
    const cookie = await this.getCookie();

    const qs = new URLSearchParams({
      ...params,
      ctime,
      version: VERSION,
      apiKey: API_KEY,
      sig
    });

    const url = `${URL_API}${apiPath}?${qs.toString()}`;
    const res = await fetch(url, {
      headers: {
        Cookie: cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://zingmp3.vn/"
      }
    });
    return await res.json();
  }

  async searchSongs(keyword) {
    const res = await this.requestZing("/api/v2/search/multi", { q: keyword });
    if (res?.err !== 0 || !res?.data?.songs) {
      return [];
    }
    return (res.data.songs || []).slice(0, 8).map((s) => ({
      id: s.encodeId,
      title: s.title,
      artists: s.artistsNames || (s.artists ? s.artists.map((a) => a.name).join(", ") : "N/A"),
      duration: s.duration || 0,
      thumbnail: s.thumbnail || s.thumbnailM || ""
    }));
  }

  async getStreamUrl(songId) {
    const res = await this.requestZing("/api/v2/song/get/streaming", { id: songId });
    if (res?.err !== 0 || !res?.data) {
      return null;
    }
    return res.data["128"] || res.data["320"] || null;
  }

  async downloadSong(songId) {
    const streamUrl = await this.getStreamUrl(songId);
    if (!streamUrl || streamUrl === "VIP") {
      throw new Error("Bài hát này thuộc bản quyền VIP hoặc không có link phát miễn phí.");
    }

    const res = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://zingmp3.vn/"
      }
    });

    if (!res.ok) {
      throw new Error(`Không thể tải tệp âm thanh (HTTP ${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(this.tmpDir, `zing_${songId}_${Date.now()}.mp3`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  setSession(threadId, senderId, songs) {
    const key = `${threadId}:${senderId}`;
    this.sessionCache.set(key, {
      songs,
      expireAt: Date.now() + 180_000 // 3 phút
    });
  }

  getSession(threadId, senderId) {
    const key = `${threadId}:${senderId}`;
    const item = this.sessionCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expireAt) {
      this.sessionCache.delete(key);
      return null;
    }
    return item.songs;
  }

  clearSession(threadId, senderId) {
    this.sessionCache.delete(`${threadId}:${senderId}`);
  }
}

async function sendSongMusic(ctx, zingService, song) {
  const textNotice = `🎵 ĐANG PHÁT TỪ ZING MP3:\n• Tên bài: ${song.title}\n• Nghệ sĩ: ${song.artists}\n• Thời lượng: ${formatDuration(song.duration)}\n• Mã bài: ${song.id}`;
  await ctx.replyText(textNotice);

  // Thử gửi dạng Voice / Audio Player thanh phát nhạc trong Zalo
  const streamUrl = await zingService.getStreamUrl(song.id);
  if (streamUrl && typeof ctx.api?.sendVoice === "function") {
    try {
      await ctx.api.sendVoice({ voiceUrl: streamUrl, ttl: 0 }, String(ctx.threadId), Number(ctx.message.type));
      return true;
    } catch (voiceErr) {
      // Voice format error or network restriction -> fallback
    }
  }

  // Fallback: Tải file mp3 và gửi qua attachment
  const filePath = await zingService.downloadSong(song.id);
  try {
    await ctx.api.sendMessage({ msg: "", attachments: [filePath] }, String(ctx.threadId), Number(ctx.message.type));
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
  return true;
}

export async function handleZingMusic(ctx, args, zingService) {

  const rawArg = args.join(" ").trim();
  if (!rawArg) {
    return ctx.reply("ZING MP3 MUSIC", [
      `Cú pháp tìm nhạc: ${ctx.prefix}nhac <tên bài hát>`,
      `Cú pháp phát nhanh: ${ctx.prefix}nhac play <tên bài hát>`,
      `Cú pháp chọn bài: ${ctx.prefix}nhac <số thứ tự>`,
      `---`,
      `Ví dụ: ${ctx.prefix}nhac Nơi Này Có Anh`,
      `Ví dụ: ${ctx.prefix}nhac 1`
    ]);
  }

  // 1. Kiểm tra nếu người dùng nhập số để chọn bài hát trong danh sách tìm kiếm trước đó
  const isNumber = /^\d+$/.test(rawArg);
  if (isNumber) {
    const choice = Number.parseInt(rawArg, 10);
    const sessionSongs = zingService.getSession(ctx.threadId, ctx.senderId);
    if (!sessionSongs || !sessionSongs.length) {
      return ctx.reply("HẾT HẠN PHIÊN", [
        "Bạn chưa tìm kiếm bài hát hoặc phiên chọn nhạc đã hết hạn (3 phút).",
        `Hãy tìm lại bằng: ${ctx.prefix}nhac <tên bài hát>`
      ]);
    }

    if (choice < 1 || choice > sessionSongs.length) {
      return ctx.reply("LỰA CHỌN KHÔNG HỢP LỆ", [
        `Vui lòng chọn từ 1 đến ${sessionSongs.length}.`,
        `Ví dụ: ${ctx.prefix}nhac 1`
      ]);
    }

    const song = sessionSongs[choice - 1];
    zingService.clearSession(ctx.threadId, ctx.senderId);
    await ctx.replyText(`⏳ Đang tải bài hát "${song.title} - ${song.artists}" từ Zing MP3...`);

    try {
      await sendSongMusic(ctx, zingService, song);
      return true;
    } catch (e) {
      return ctx.reply("LỖI PHÁT NHẠC", [
        `Không thể phát bài "${song.title}": ${e.message}`,
        "Bài hát có thể yêu cầu tài khoản VIP Zing MP3."
      ]);
    }
  }

  // 2. Chế độ phát nhanh (play)
  let isPlayFast = false;
  let keyword = rawArg;
  if (rawArg.toLowerCase().startsWith("play ")) {
    isPlayFast = true;
    keyword = rawArg.slice(5).trim();
  }

  await ctx.replyText(`🔍 Đang tìm kiếm "${keyword}" trên Zing MP3...`);
  const songs = await zingService.searchSongs(keyword);

  if (!songs.length) {
    return ctx.reply("KHÔNG TÌM THẤY", [
      `Không tìm thấy bài hát nào phù hợp với từ khóa "${keyword}".`,
      "Vui lòng thử lại với tên bài hát hoặc ca sĩ khác."
    ]);
  }

  // Nếu là chế độ phát nhanh, tải và gửi luôn bài đầu tiên
  if (isPlayFast) {
    const song = songs[0];
    await ctx.replyText(`⏳ Đang tải bài hát "${song.title} - ${song.artists}"...`);
    try {
      await sendSongMusic(ctx, zingService, song);
      return true;
    } catch (e) {
      return ctx.reply("LỖI PHÁT NHẠC", [`Không thể phát bài "${song.title}": ${e.message}`]);
    }
  }


  // Lưu session và hiển thị danh sách cho người dùng chọn
  zingService.setSession(ctx.threadId, ctx.senderId, songs);
  const lines = songs.map((s, index) => `${index + 1}. ${s.title} - ${s.artists} (${formatDuration(s.duration)})`);
  lines.push("---");
  lines.push(`Gõ "${ctx.prefix}nhac <số>" (ví dụ: ${ctx.prefix}nhac 1) để nghe nhạc.`);

  return ctx.reply("KẾT QUẢ TÌM KIẾM ZING MP3", lines);
}
