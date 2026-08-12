import { handleAdmin } from "./admin.js";
import { handleGroup } from "./group.js";
import { handleDeleteMasterCommand, handleMasterCommand } from "./masterCommand.js";
import { parseSpamMessage } from "./spamMessage.js";

const MENU = [
  "AI GEMINI",
  "'tl nội dung cần hỏi",
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
  if (command === "ml") return handleMasterCommand(ctx, body.slice(rawCommand.length));
  if (command === "de-ml" || command === "deml") return handleDeleteMasterCommand(ctx, args);
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
