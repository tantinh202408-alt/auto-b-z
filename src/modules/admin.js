export async function handleAdmin(ctx, args) {
  if (!ctx.isOwner) return ctx.reply("TỪ CHỐI", ["Chỉ owner được quản lý admin."]);
  let action = args[0]?.toLowerCase() || "";
  let remainingArgs = args.slice(1);
  if (action === "admin") {
    action = remainingArgs[0]?.toLowerCase() || "";
    remainingArgs = remainingArgs.slice(1);
  }

  const isRemove = ["remove", "cut", "delete", "xoa", "xóa"].includes(action);
  const isAdd = ["add", "them", "thêm"].includes(action);
  const isList = ["list", "danhsach", "danhsách"].includes(action);

  const mention = ctx.message?.data?.mentions?.[0];
  const targetArg = remainingArgs[0] || args[1] || "";
  const fallbackId = /^\d{5,}$/.test(targetArg) ? targetArg : "";
  const userId = String(mention?.uid || fallbackId || "");
  const mentionedText = mention ? String(ctx.content).slice(Number(mention.pos || 0), Number(mention.pos || 0) + Number(mention.len || 0)) : "";
  const displayName = mentionedText.replace(/^@/, "").trim() || remainingArgs.join(" ").replace(/^@/, "").trim() || targetArg.replace(/^@/, "").trim() || userId;

  if ((isAdd || isRemove) && !userId) {
    return ctx.reply("CHƯA TAG THÀNH VIÊN", [
      `Hãy tag đúng người trong nhóm:`,
      `${ctx.prefix}admin add @Tên`,
      `${ctx.prefix}cut admin @Tên`
    ]);
  }

  if (isAdd) {
    await ctx.store.set(`admins/${userId}`, { id: userId, name: displayName, addedAt: Date.now(), addedBy: ctx.senderId });
    return ctx.reply("ADMIN", [`Đã thêm admin: ${displayName}`, `UID: ${userId}`]);
  }
  if (isRemove) {
    await ctx.store.remove(`admins/${userId}`);
    return ctx.reply("ADMIN", [`Đã xóa vai trò admin: ${displayName}`, `UID: ${userId}`]);
  }
  if (isList) {
    const admins = await ctx.store.get("admins", {});
    const lines = Object.entries(admins).map(([id, admin]) => `${admin?.name || "Admin"} • ${id}`);
    return ctx.reply("DANH SÁCH ADMIN", lines.length ? lines : ["Chưa có admin."]);
  }

  return ctx.reply("CÚ PHÁP", [
    `${ctx.prefix}admin add @Tên`,
    `${ctx.prefix}admin remove @Tên`,
    `${ctx.prefix}cut admin @Tên`,
    `${ctx.prefix}admin list`
  ]);
}
