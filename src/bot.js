import fs from "node:fs/promises";
import path from "node:path";
import { AvatarSize, Reactions, ThreadType, Zalo } from "zca-js";
import sharp from "sharp";
import { enforceAntiLink } from "./modules/antiLink.js";
import { clearSpamUser, enforceAntiSpam } from "./modules/antiSpam.js";
import { executeCommand } from "./modules/command.js";
import { ImageGenerator } from "./modules/imageGenerator.js";
import { AutoRailink } from "./modules/autoRailink.js";
import { GeminiClient } from "./modules/gemini.js";
import { TaskScheduler } from "./modules/taskScheduler.js";
import { fetchAvatar } from "./utils/avatar.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class SangdevBot {
  constructor(config, store, logger) { this.config = config; this.store = store; this.logger = logger; this.api = null; this.stopping = false; this.connecting = false; this.reconnectTimer = null; this.stableTimer = null; this.reconnectAttempt = 0; this.groupTimers = new Map(); this.webMessages = []; this.conversationCache = { at: 0, value: [] }; this.images = new ImageGenerator(config.root); this.railink = new AutoRailink({ store, getApi: () => this.api, logger }); this.gemini = new GeminiClient({ apiKey: config.geminiApiKey, model: config.geminiModel }); this.scheduler = new TaskScheduler({ store, getApi: () => this.api, logger }); }
  async start() { await this.railink.restore(); await this.restoreGroupLocks(); this.scheduler.start(); await this.connectWithRetry(); }
  async connectWithRetry() {
    if (this.stopping || this.connecting || this.api) return;
    this.connecting = true;
    try { await this.connect(); }
    catch (error) { this.logger.error("Đăng nhập/kết nối Zalo thất bại", error); this.scheduleReconnect(); }
    finally { this.connecting = false; }
  }
  scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const delay = Math.min(60_000, 2 ** Math.min(this.reconnectAttempt++, 6) * 1_000);
    this.logger.warn(`Sẽ kết nối lại Zalo sau ${delay / 1000}s`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connectWithRetry().catch((e) => this.logger.error("Reconnect thất bại", e)); }, delay);
  }
  async connect() {
    if (!this.config.cookie.length || !this.config.imei || !this.config.userAgent) throw new Error("Thiếu cookie, imei hoặc userAgent trong config.json");
    const zalo = new Zalo({ selfListen: true, imageMetadataGetter: async (file) => { const data = await fs.readFile(file); const meta = await sharp(data).metadata(); return { width: meta.width, height: meta.height, size: data.length }; } });
    this.api = await zalo.login({ cookie: this.config.cookie, imei: this.config.imei, userAgent: this.config.userAgent });
    this.api.listener.on("connected", () => { this.logger.info("SANGDEV BOT đã kết nối Zalo"); clearTimeout(this.stableTimer); this.stableTimer = setTimeout(() => { this.reconnectAttempt = 0; }, 60_000); });
    this.api.listener.on("message", (message) => this.onMessage(message).catch((e) => this.logger.error("Lỗi xử lý tin nhắn", e)));
    this.api.listener.on("group_event", (event) => this.onGroupEvent(event).catch((e) => this.logger.error("Lỗi xử lý sự kiện nhóm", e)));
    this.api.listener.on("error", (error) => this.logger.error("Listener Zalo báo lỗi", error));
    this.api.listener.on("closed", (code, reason) => { this.logger.warn("Kết nối Zalo đã đóng", { code, reason }); clearTimeout(this.stableTimer); this.api = null; this.scheduleReconnect(); });
    // Chỉ dùng reconnect của bot; không bật thêm retry nội bộ để tránh hai listener tranh cùng phiên.
    this.api.listener.start({ retryOnClose: false });
  }
  async onMessage(message) {
    const rawContent = message.data?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    const senderId = String(message.data?.uidFrom || message.threadId); const threadId = String(message.threadId); const isGroup = message.type === ThreadType.Group;
    this.recordWebMessage({ id: String(message.data?.msgId || Date.now()), threadId, type: message.type, senderId, senderName: message.data?.dName || senderId, content: content || "[Tệp/ảnh đính kèm]", outgoing: message.isSelf, time: Number(message.data?.ts || Date.now()) });
    // Cho phép owner điều khiển bot bằng chính tài khoản bot, nhưng chỉ với câu lệnh.
    if (message.isSelf && !content.startsWith(this.config.prefix)) return;
    if (content.startsWith(this.config.prefix)) this.logger.info("Đã nhận lệnh Zalo", { command: content.split(/\s+/)[0], senderId, threadId, isSelf: message.isSelf });
    await this.store.update(`users/${senderId}`, { id: senderId, username: message.data.dName || "", avatar: message.data.avatar || "", lastSeen: Date.now() });
    const isOwner = senderId === this.config.ownerId; const isAdmin = isOwner || Boolean(await this.store.get(`admins/${senderId}`, false));
    const group = isGroup ? await this.store.get(`groups/${threadId}`, {}) : {};
    const ctx = this.makeContext({ message, content, rawContent, senderId, threadId, isGroup, isOwner, isAdmin });
    const enabled = await this.store.get("settings/botEnabled", true);
    if (!enabled && !(isOwner && content === `${this.config.prefix}boton`)) return;
    if (isGroup && !group.status && !isAdmin) return;
    if (isGroup && group.antisp && content && await enforceAntiSpam(ctx)) return;
    if (isGroup && group.antilink && await enforceAntiLink(ctx)) return;
    if (!content) return;
    await executeCommand(ctx);
  }
  async onGroupEvent(event) {
    if (event.type !== "join") return;
    const groupId = String(event.threadId || event.data?.groupId || "");
    if (!groupId) return;
    const members = Array.isArray(event.data?.updateMembers) ? event.data.updateMembers : [];
    for (const member of members) {
      const userId = String(member.id || ""); if (!userId) continue;
      await this.store.remove(`warnings/${groupId}/${userId}`);
      await this.store.update(`users/${userId}`, { warnings: 0, blacklisted: false, rejoinedAt: Date.now() });
      clearSpamUser(groupId, userId);
      await this.store.set(`logs/${Date.now()}_${userId}_rejoin`, { userId, groupId, action: "reset_warnings_on_rejoin", time: Date.now() });
      this.logger.info("Đã reset vi phạm cho thành viên vào lại", { groupId, userId });
    }
    const settings = await this.store.get(`groups/${groupId}`, {});
    if (!settings.status || settings.welcome === false) return;
    for (const member of members) {
      const userId = String(member.id || "");
      if (!userId || userId === this.config.ownerId) continue;
      let avatarSource = member.avatar ? "join-event" : member.avatar_25 ? "join-event-small" : "none";
      let avatar = await fetchAvatar(member.avatar || member.avatar_25);
      let name = member.dName || "Thành viên mới";
      if (!avatar) try { const info = await this.api.getUserInfo(userId, AvatarSize.Large); const user = info?.changed_profiles?.[userId]; avatar = await fetchAvatar(user?.avatar || user?.bgavatar); name = user?.displayName || user?.zaloName || name; if (avatar) avatarSource = "user-profile"; } catch (error) { this.logger.debug("Không lấy được avatar từ hồ sơ", { userId, message: error.message }); }
      if (!avatar) try { const info = await this.api.getGroupInfo(groupId); const group = info?.gridInfoMap?.[groupId]; const current = group?.currentMems?.find((item) => String(item.id) === userId); avatar = await fetchAvatar(current?.avatar || current?.avatar_25); name = current?.dName || current?.zaloName || name; if (avatar) avatarSource = "group-member"; } catch (error) { this.logger.debug("Không lấy được avatar từ nhóm", { userId, groupId, message: error.message }); }
      const file = await this.images.renderWelcome({ name, groupName: event.data?.groupName || "CỘNG ĐỒNG SANGDEV", avatar });
      try { await this.api.sendMessage({ msg: "", attachments: [file] }, groupId, 1); this.logger.info("Đã chào mừng thành viên mới", { groupId, userId, name, avatarSource, hasAvatar: Boolean(avatar) }); }
      finally { fs.unlink(file).catch(() => {}); }
    }
  }
  recordWebMessage(message) { this.webMessages.push(message); if (this.webMessages.length > 500) this.webMessages.splice(0, this.webMessages.length - 500); }
  getWebMessages(threadId = "") { return this.webMessages.filter((item) => !threadId || item.threadId === String(threadId)).slice(-150); }
  async getDashboardConversations(force = false) {
    if (!this.api) return this.conversationCache.value;
    if (!force && Date.now() - this.conversationCache.at < 60_000) return this.conversationCache.value;
    const conversations = [];
    try {
      const allGroups = await this.api.getAllGroups(); const ids = Object.keys(allGroups?.gridVerMap || {});
      if (ids.length) { const result = await this.api.getGroupInfo(ids); for (const group of Object.values(result?.gridInfoMap || {})) conversations.push({ id: String(group.groupId), type: 1, name: group.name || group.groupId, avatar: group.fullAvt || group.avt || "", members: group.totalMember || group.memberIds?.length || 0 }); }
      const friends = await this.api.getAllFriends(200, 1); for (const friend of friends || []) conversations.push({ id: String(friend.userId), type: 0, name: friend.displayName || friend.zaloName || friend.userId, avatar: friend.avatar || "", online: Boolean(friend.isActive) });
      this.conversationCache = { at: Date.now(), value: conversations };
    } catch (error) { this.logger.warn("Không tải được danh sách hội thoại cho dashboard", error); }
    return this.conversationCache.value;
  }
  async sendDashboardMessage({ threadId, type = 1, content }) {
    if (!this.api) throw new Error("Bot chưa kết nối Zalo");
    const text = String(content || "").trim(); if (!text) throw new Error("Nội dung trống");
    await this.api.sendMessage({ msg: text }, String(threadId), Number(type));
    this.recordWebMessage({ id: String(Date.now()), threadId: String(threadId), type: Number(type), senderId: this.config.ownerId, senderName: "SANGDEV BOT", content: text, outgoing: true, time: Date.now() });
  }
  async sendDashboardImage({ threadId, type = 1, buffer, originalName = "image.jpg", caption = "" }) {
    if (!this.api) throw new Error("Bot chưa kết nối Zalo");
    if (!threadId || !buffer?.length) throw new Error("Thiếu hội thoại hoặc dữ liệu ảnh");
    const extension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg";
    const file = path.join(this.config.root, "tmp", `dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, buffer);
    try {
      await this.api.sendMessage({ msg: String(caption || ""), attachments: [file] }, String(threadId), Number(type));
      this.recordWebMessage({ id: String(Date.now()), threadId: String(threadId), type: Number(type), senderId: this.config.ownerId, senderName: "SANGDEV BOT", content: caption ? `Ảnh: ${caption}` : "Đã gửi một ảnh", outgoing: true, time: Date.now() });
    } finally { await fs.unlink(file).catch(() => {}); }
  }
  makeContext(base) {
    const bot = this;
    return { ...base, prefix: this.config.prefix, store: this.store, railink: this.railink, gemini: this.gemini, scheduler: this.scheduler, logger: this.logger,
      kick: (groupId, userId) => bot.kick(groupId, userId),
      isPrivileged: async (id) => id === bot.config.ownerId || Boolean(await bot.store.get(`admins/${id}`, false)) || Boolean(await bot.store.get(`permissions/whitelist/${id}`, false)),
      reply: async (title, lines) => { await bot.safeReact(base.message); let avatar = null; try { const info = await bot.api.getUserInfo(base.senderId); const user = info?.changed_profiles?.[base.senderId] || info?.[base.senderId]; avatar = await fetchAvatar(user?.avatar); } catch { /* Avatar is optional. */ } const file = await bot.images.render({ title, lines, avatar }); try { return await bot.api.sendMessage({ msg: "", attachments: [file] }, base.threadId, base.message.type); } finally { fs.unlink(file).catch(() => {}); } },
      replyText: async (text) => { await bot.safeReact(base.message); const chunks = String(text).match(/[\s\S]{1,1800}/g) || []; for (const chunk of chunks) await bot.api.sendMessage({ msg: chunk }, base.threadId, base.message.type); },
      sendRepeatedText: async (text, count) => { await bot.safeReact(base.message); bot.logger.info("Bắt đầu gửi lặp tin nhắn", { threadId: base.threadId, senderId: base.senderId, count }); for (let index = 0; index < count; index++) { await bot.api.sendMessage({ msg: text }, base.threadId, base.message.type); if (index < count - 1) await wait(700); } bot.logger.info("Đã gửi xong tin nhắn lặp", { threadId: base.threadId, count }); },
      safeDelete: (message) => bot.safeDelete(message),
      warnUser: async (reason, detail) => { const warnings = await bot.store.increment(`warnings/${base.threadId}/${base.senderId}/count`); await bot.store.update(`warnings/${base.threadId}/${base.senderId}`, { reason, lastAt: Date.now() }); await bot.store.set(`logs/${Date.now()}_${base.senderId}`, { userId: base.senderId, groupId: base.threadId, reason, action: warnings >= 10 ? "kick" : "warning", time: Date.now() }); if (warnings >= 10) await bot.kick(base.threadId, base.senderId); return bot.makeContext(base).reply("USER WARNING", [detail, `Người dùng: ${base.message.data.dName || base.senderId}`, `Lý do: ${reason}`, `Vi phạm: ${warnings}/10`]); },
      setGroupChat: (enabled) => bot.setGroupChat(base.threadId, enabled),
      scheduleGroupLock: (expire) => bot.scheduleGroupLock(base.threadId, expire)
    };
  }
  async safeReact(message) { try { await this.api.addReaction({ rType: 0, source: 6, icon: "🤖" }, message); } catch { try { await this.api.addReaction(Reactions.LIKE, message); } catch (e) { this.logger.debug("Không thể react", e); } } }
  async safeDelete(message) { try { const result = await this.api.deleteMessage({ data: { cliMsgId: message.data.cliMsgId, msgId: message.data.msgId, uidFrom: message.data.uidFrom }, threadId: message.threadId, type: message.type }, false); this.logger.info("Đã xóa tin nhắn cho mọi người", { threadId: message.threadId, msgId: message.data.msgId, status: result?.status }); return true; } catch (e) { this.logger.warn("Không thể xóa tin nhắn cho mọi người; hãy cấp quyền phó nhóm cho bot", e); return false; } }
  async kick(groupId, userId) { try { await this.api.removeUserFromGroup(userId, groupId); } catch (e) { this.logger.warn("Không thể kick thành viên", e); } }
  async setGroupChat(groupId, enabled) { try { if (typeof this.api?.updateGroupSettings === "function") await this.api.updateGroupSettings({ lockSendMsg: !enabled }, groupId); else throw new Error("Phiên bản zca-js không hỗ trợ khóa chat"); await this.store.update(`groups/${groupId}`, { chatEnabled: enabled, expire: null }); } catch (e) { this.logger.warn("Không thể đổi quyền chat nhóm", e); } }
  scheduleGroupLock(groupId, expire) { if (this.groupTimers.has(groupId)) clearTimeout(this.groupTimers.get(groupId)); const delay = Math.max(0, expire - Date.now()); const timer = setTimeout(() => this.setGroupChat(groupId, false), Math.min(delay, 2_147_483_647)); this.groupTimers.set(groupId, timer); }
  async restoreGroupLocks() { const groups = await this.store.get("groups", {}); for (const [groupId, settings] of Object.entries(groups)) if (settings.expire) this.scheduleGroupLock(groupId, settings.expire); }
  stop() { this.stopping = true; clearTimeout(this.reconnectTimer); clearTimeout(this.stableTimer); this.railink.stopTimer(); this.scheduler.stop(); for (const timer of this.groupTimers.values()) clearTimeout(timer); try { this.api?.listener.stop(); } catch {} }
}
