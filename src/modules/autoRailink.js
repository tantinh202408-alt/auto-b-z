import { parseDuration } from "./group.js";

export class AutoRailink {
  constructor({ store, getApi, logger }) { this.store = store; this.getApi = getApi; this.logger = logger; this.timer = null; }
  async restore() {
    this.stopTimer();
    const job = await this.store.get("settings/railink", null);
    if (!job?.enabled) return;
    const target = Math.min(Number(job.nextRun || Date.now()), Number(job.expiresAt || Date.now()));
    const delay = Math.min(Math.max(0, target - Date.now()), 2_147_483_647);
    this.timer = setTimeout(() => { this.timer = null; this.tick().catch((e) => { this.logger.error("Lỗi rải tin", e); this.restore().catch(() => {}); }); }, delay);
  }
  async create(raw, ownerId) {
    const match = raw.match(/^([\s\S]+?)\s+(\d+(?:\s*[spmhd]\s*\d*)*[spmhd])\s+(\d+(?:\s*[spmhd]\s*\d*)*[spmhd])$/i);
    if (!match) throw new Error("Cú pháp: 'railink NỘI_DUNG 3d 12h (d=ngày, h=giờ, p=phút, s=giây)");
    const duration = parseDuration(match[2]); const delay = parseDuration(match[3]);
    if (!duration || !delay || delay < 1_000) throw new Error("Thời gian không hợp lệ; delay tối thiểu 1 giây.");
    const now = Date.now();
    await this.store.set("settings/railink", { enabled: true, content: match[1], ownerId, createdAt: now, expiresAt: now + duration, delay, nextRun: now });
    await this.restore();
  }
  async stop() {
    this.stopTimer();
    await this.store.update("settings/railink", { enabled: false, expiresAt: null, nextRun: null, stoppedAt: Date.now() });
    this.logger.info("Đã hủy toàn bộ lịch rải tin");
  }
  stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async tick() {
    const job = await this.store.get("settings/railink", null); const now = Date.now();
    if (!job?.enabled || now >= job.expiresAt) return this.stop();
    if (now < job.nextRun) return this.restore();
    await this.store.set("settings/railink/nextRun", now + job.delay);
    const groups = await this.store.get("groups", {}); const api = this.getApi(); if (!api) return this.restore();
    for (const [groupId, settings] of Object.entries(groups)) if (settings.status) {
      try { await api.sendMessage({ msg: job.content }, groupId, 1); }
      catch (error) { this.logger.warn(`Không thể rải tin vào nhóm ${groupId}`, error); }
    }
    await this.restore();
  }
}
