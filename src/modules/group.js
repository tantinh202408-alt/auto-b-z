export function parseDuration(value) {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}$/.test(value)) { const [hours, minutes] = value.split(":").map(Number); return hours * 3_600_000 + minutes * 60_000; }
  const units = { s: 1_000, p: 60_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const matches = [...String(value).matchAll(/(\d+)\s*([spmhd])/gi)];
  if (!matches.length || matches.map((m) => m[0]).join("").replace(/\s/g, "").length !== String(value).replace(/\s/g, "").length) return null;
  return matches.reduce((sum, m) => sum + Number(m[1]) * units[m[2].toLowerCase()], 0);
}

export async function handleGroup(ctx, command, args) {
  if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Lệnh này chỉ dành cho quản trị viên."]);
  const base = `groups/${ctx.threadId}`;
  if (command === "oday" || command === "offday") { const status = command === "oday"; await ctx.store.update(base, { status, updatedAt: Date.now() }); return ctx.reply("NHÓM", [status ? "Đã cấp phép bot và rải tin." : "Đã tắt quyền bot và rải tin."]); }
  if (command === "antisp" || command === "antilink" || command === "welcome") { const enabled = args[0] === "on"; if (!["on", "off"].includes(args[0])) return ctx.reply("CÚ PHÁP", [`${ctx.prefix}${command} on/off`]); await ctx.store.set(`${base}/${command}`, enabled); return ctx.reply(command === "welcome" ? "WELCOME SYSTEM" : "BẢO VỆ", [`${command}: ${enabled ? "BẬT" : "TẮT"}`]); }
  if (command === "offgr") { const duration = parseDuration(args[0]); if (!duration) return ctx.reply("CÚ PHÁP", [`${ctx.prefix}offgr 2:00 (2 giờ) hoặc 30m`]); const expire = Date.now() + duration; await ctx.store.update(base, { chatEnabled: true, expire }); ctx.scheduleGroupLock(expire); return ctx.reply("HẸN GIỜ ĐÓNG NHÓM", [`Nhóm sẽ khóa chat lúc ${new Date(expire).toLocaleString("vi-VN")}.`]); }
  if (command === "ongr") { await ctx.store.update(base, { chatEnabled: true, expire: null }); await ctx.setGroupChat(true); return ctx.reply("MỞ NHÓM", ["Đã khôi phục quyền chat."]); }
  return false;
}
