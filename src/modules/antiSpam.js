const activity = new Map();
export function detectSpam(key, content, now = Date.now(), message = null) {
  const recent = (activity.get(key) || []).filter((item) => now - item.time <= 5_000);
  recent.push({ time: now, content: String(content).trim().toLowerCase(), message });
  activity.set(key, recent);
  const repeated = recent.filter((x) => x.content && x.content === recent.at(-1).content).length >= 5;
  return recent.length >= 10 || repeated;
}
export function clearSpamState() { activity.clear(); }
export function clearSpamUser(threadId, userId) { activity.delete(`${threadId}:${userId}`); }

export async function enforceAntiSpam(ctx) {
  if (await ctx.isPrivileged(ctx.senderId)) return false;
  if (!detectSpam(`${ctx.threadId}:${ctx.senderId}`, ctx.content, Date.now(), ctx.message)) return false;
  const items = activity.get(`${ctx.threadId}:${ctx.senderId}`) || [];
  const messages = items.map((x) => x.message).filter(Boolean);
  await Promise.allSettled([ctx.message, ...messages].map((m) => ctx.safeDelete(m)));
  await ctx.warnUser("SPAM", "Phát hiện gửi tin nhắn quá nhanh hoặc lặp nội dung");
  activity.delete(`${ctx.threadId}:${ctx.senderId}`);
  return true;
}
