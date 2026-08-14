import { handleAdmin } from "./admin.js";
import { handleGroup } from "./group.js";
import { handleDeleteMasterCommand, handleMasterCommand } from "./masterCommand.js";
import { parseSpamMessage } from "./spamMessage.js";
import { handleZingMusic } from "./zingMp3.js";

const MENU = [
  "LỜI CHÀO & GIỚI THIỆU",
  "'hi • 'hello",
  "MUSIC ZING MP3 (DÀNH CHO TẤT CẢ THÀNH VIÊN)",
  "'nhac <tên bài hát> • 'nhac <số>",
  "'play <tên bài hát> • 'chon <số>",
  "AI GEMINI",
  "'tl nội dung cần hỏi",
  "'apikey <key_mới>",
  "MỆNH LỆNH ADMIN (AI MASTER)",
  "'ml <mệnh lệnh> • 'de-ml [số]",
  "ADMIN SYSTEM",
  "'admin add @Tên • 'admin remove @Tên",
  "'cut admin @Tên • 'admin list",
  "BOT SYSTEM",
  "'boton • 'botoff",
  "GROUP SYSTEM",
  "'oday • 'offday • 'offgr 2:00 • 'ongr",
  "WELCOME",
  "'welcome on/off",
  "SECURITY",
  "'antisp on/off • 'antilink on/off",
  "AUTO MESSAGE",
  "'railink nội dung 3d 12h • 'railinkoff",
  "REPEAT MESSAGE",
  "'sp nội dung số_lượng"
];


export async function executeCommand(ctx) {
  if (!ctx.content.startsWith(ctx.prefix)) return false;
  const body = ctx.content.slice(ctx.prefix.length).trim();
  const [rawCommand = "", ...args] = body.split(/\s+/);
  const command = rawCommand.toLowerCase();
  if (!command) return false;

  if (command === "menu") return ctx.reply("COMMAND CENTER", MENU.map((x) => x.replaceAll("'", ctx.prefix)));
  if (["hi", "hello", "chao", "xin-chao", "xinchao"].includes(command)) {
    const greetingText = `Chào bạn 😆, tui là đệ tử của Sang nè. Bạn đang cần gì hông?

Nhóm tui hay share đủ thứ hay ho, từ kiến thức tới kinh nghiệm thực chiến nek 👉 https://zalo.me/g/ocwdspdydwcdkg3znna0

Tiện thể ghé TikTok @sangnguyendev với website Sang dev - Sàn giao dịch mã nguồn (https://sangdev.online/) xem thử, biết đâu lại học lỏm được vài kèo hay 😎`;
    await ctx.replyText(greetingText);
    return true;
  }

  if (command === "ml") return handleMasterCommand(ctx, body.slice(rawCommand.length));
  if (command === "de-ml" || command === "deml") return handleDeleteMasterCommand(ctx, args);
  if (command === "apikey" || command === "setapikey" || command === "key") {
    if (!ctx.isOwner) return ctx.reply("TỪ CHỐI", ["Chỉ Owner mới có quyền xem và đổi API Key AI Gemini."]);
    const newKey = body.slice(rawCommand.length).trim();
    if (!newKey) {
      const currentKey = ctx.gemini.apiKey || "";
      const maskedKey = currentKey ? `${currentKey.slice(0, 8)}...${currentKey.slice(-6)}` : "Chưa cấu hình";
      return ctx.reply("QUẢN LÝ GEMINI API KEY", [
        `Trạng thái Key hiện tại: ${maskedKey}`,
        `Model: ${ctx.gemini.model || "gemini-flash-latest"}`,
        `---`,
        `Cú pháp đổi Key: ${ctx.prefix}apikey <key_mới>`,
        `Ví dụ: ${ctx.prefix}apikey AIzaSyAbc123xyz...`
      ]);
    }

    try {
      ctx.gemini.apiKey = newKey;
      await ctx.store.set("settings/geminiApiKey", newKey);
      const masked = `${newKey.slice(0, 8)}...${newKey.slice(-6)}`;
      return ctx.reply("CẬP NHẬT THÀNH CÔNG", [
        "Đã lưu và cập nhật Gemini API Key mới vào Cloud Database!",
        `API Key mới: ${masked}`,
        `Lệnh AI ('tl, 'ml) đã sẵn sàng sử dụng ngay.`
      ]);
    } catch (err) {
      return ctx.reply("LỖI ĐỔI API KEY", [`Không thể lưu API Key: ${err.message}`]);
    }
  }
  if (command === "tl") {
    const prompt = body.slice(rawCommand.length).trim();
    if (!prompt) return ctx.reply("GEMINI AI", [`Cú pháp: ${ctx.prefix}tl nội dung cần hỏi`]);
    try {
      const answer = await ctx.gemini.ask({ prompt, userId: ctx.senderId, userName: ctx.message.data?.dName || "người dùng", threadId: ctx.threadId });
      await ctx.replyText(answer);
      return true;
    } catch (error) {
      return ctx.reply("GEMINI ERROR", [error.message]);
    }
  }

  if (["nhac", "zing", "music", "mp3", "baihat"].includes(command)) {
    return handleZingMusic(ctx, args, ctx.zing);
  }

  if (command === "play") {
    return handleZingMusic(ctx, ["play", ...args], ctx.zing);
  }
  if (command === "chon" || command === "pick") {
    return handleZingMusic(ctx, args, ctx.zing);
  }

  if (command === "sp") {

    if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ owner hoặc admin được dùng lệnh sp."]);
    const parsed = parseSpamMessage(body.slice(rawCommand.length));
    if (!parsed) return ctx.reply("CÚ PHÁP SP", [`${ctx.prefix}sp nội dung số_lượng`, `Ví dụ: ${ctx.prefix}sp Xin chào mọi người 5`]);
    if (parsed.count > 30) return ctx.reply("GIỚI HẠN SP", ["Số lượng tối đa là 30 tin mỗi lệnh."]);
    await ctx.sendRepeatedText(parsed.content, parsed.count);
    return true;
  }
  if (command === "admin") return handleAdmin(ctx, args);
  if (command === "cut") {
    if (args[0]?.toLowerCase() === "admin") return handleAdmin(ctx, ["remove", ...args.slice(1)]);
    return handleAdmin(ctx, ["remove", ...args]);
  }
  if (command === "cutadmin" || command === "cut-admin") return handleAdmin(ctx, ["remove", ...args]);
  if (["oday", "offday", "welcome", "antisp", "antilink", "offgr", "ongr"].includes(command)) return handleGroup(ctx, command, args);
  if (command === "boton" || command === "botoff") {
    if (!ctx.isOwner) return ctx.reply("TỪ CHỐI", ["Chỉ owner được bật/tắt bot."]);
    const enabled = command === "boton";
    await ctx.store.set("settings/botEnabled", enabled);
    return ctx.reply("BOT SYSTEM", [`Bot đã ${enabled ? "BẬT" : "TẮT"}.`]);
  }
  if (command === "railink" && ["off", "stop", "huy", "hủy"].includes(args[0]?.toLowerCase())) {
    if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ admin được dùng lệnh này."]);
    await ctx.railink.stop();
    return ctx.reply("AUTO MESSAGE", ["Đã hủy toàn bộ lịch rải tin."]);
  }
  if (command === "railink") {
    if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ admin được dùng lệnh này."]);
    try {
      await ctx.railink.create(body.slice(rawCommand.length).trim(), ctx.senderId);
      return ctx.reply("AUTO MESSAGE", ["Đã bật lịch rải tin.", `Hủy bằng: ${ctx.prefix}railinkoff`]);
    } catch (e) {
      return ctx.reply("LỖI CÚ PHÁP", [e.message]);
    }
  }
  if (["railinkoff", "huyrailink"].includes(command)) {
    if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ admin được dùng lệnh này."]);
    await ctx.railink.stop();
    return ctx.reply("AUTO MESSAGE", ["Đã hủy toàn bộ lịch rải tin."]);
  }
  return false;
}
