export async function handleAdmin(ctx, args) {
  if (!ctx.isOwner) return ctx.reply("TỪ CHỐI", ["Chỉ owner được quản lý admin."]);
  const action = args[0]?.toLowerCase();
  const mention = ctx.message?.data?.mentions?.[0];
  const fallbackId = /^\d{5,}$/.test(args[1] || "") ? args[1] : "";
  const userId = String(mention?.uid || fallbackId || "");
  const mentionedText = mention ? String(ctx.content).slice(Number(mention.pos || 0), Number(mention.pos || 0) + Number(mention.len || 0)) : "";
  const displayName = mentionedText.replace(/^@/, "").trim() || args.slice(1).join(" ").replace(/^@/, "").trim() || userId;
  if (["add", "remove"].includes(action) && !userId) return ctx.reply("CHƯA TAG THÀNH VIÊN", [`Hãy tag đúng người trong nhóm:`, `${ctx.prefix}admin ${action} @Tên`]);
  if (action === "add") { await ctx.store.set(`admins/${userId}`, { id: userId, name: displayName, addedAt: Date.now(), addedBy: ctx.senderId }); return ctx.reply("ADMIN", [`Đã thêm admin: ${displayName}`, `UID: ${userId}`]); }
  if (action === "remove") { await ctx.store.remove(`admins/${userId}`); return ctx.reply("ADMIN", [`Đã xóa admin: ${displayName}`, `UID: ${userId}`]); }
  if (action === "list") { const admins = await ctx.store.get("admins", {}); const lines = Object.entries(admins).map(([id, admin]) => `${admin?.name || "Admin"} • ${id}`); return ctx.reply("DANH SÁCH ADMIN", lines.length ? lines : ["Chưa có admin."]); }
  return ctx.reply("CÚ PHÁP", [`${ctx.prefix}admin add @Tên`, `${ctx.prefix}admin remove @Tên`, `${ctx.prefix}admin list`]);
}
