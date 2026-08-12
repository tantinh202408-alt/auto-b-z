import { fetchWeather } from "./weather.js";

export class TaskScheduler {
  constructor({ store, getApi, logger }) {
    this.store = store;
    this.getApi = getApi;
    this.logger = logger;
    this.timer = null;
    this.intervalMs = 30_000; // Check every 30 seconds
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger.info("Khởi động TaskScheduler cho các mệnh lệnh lặp/ghi nhớ");
    this.checkTasks().catch((e) => this.logger.error("Lỗi kiểm tra lịch ban đầu", e));
    this.timer = setInterval(() => {
      this.checkTasks().catch((e) => this.logger.error("Lỗi trong vòng lặp TaskScheduler", e));
    }, this.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getAllTasks() {
    const all = await this.store.get("scheduled_tasks", {});
    const tasks = [];
    for (const [threadId, threadTasks] of Object.entries(all || {})) {
      if (!threadTasks || typeof threadTasks !== "object") continue;
      for (const [taskId, task] of Object.entries(threadTasks)) {
        if (task && typeof task === "object") {
          tasks.push({ ...task, id: taskId, threadId });
        }
      }
    }
    return tasks;
  }

  async getTasksForThread(threadId) {
    const threadTasks = await this.store.get(`scheduled_tasks/${threadId}`, {});
    if (!threadTasks || typeof threadTasks !== "object") return [];
    return Object.entries(threadTasks)
      .map(([id, task]) => ({ ...task, id, threadId }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async addTask({ threadId, title, type = "weather", location = "Hà Nội", message = "", intervalMinutes = 1440, createdBy = "" }) {
    const now = Date.now();
    const taskId = `ml_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const intervalMs = Math.max(1, Number(intervalMinutes) || 1440) * 60_000;
    const task = {
      id: taskId,
      threadId: String(threadId),
      title: String(title || "Mệnh lệnh tự động"),
      type: String(type),
      location: String(location),
      message: String(message),
      intervalMinutes: Math.max(1, Number(intervalMinutes) || 1440),
      createdBy: String(createdBy),
      createdAt: now,
      lastRunAt: 0,
      nextRunAt: now + 5_000 // Run first time shortly after creation
    };

    await this.store.set(`scheduled_tasks/${threadId}/${taskId}`, task);
    this.logger.info("Đã tạo mệnh lệnh lặp mới", { threadId, taskId, title: task.title, intervalMinutes });
    return task;
  }

  async deleteTaskByIndex(threadId, index) {
    const tasks = await this.getTasksForThread(threadId);
    const target = tasks[index - 1];
    if (!target) return null;
    await this.store.remove(`scheduled_tasks/${threadId}/${target.id}`);
    this.logger.info("Đã hủy mệnh lệnh ghi nhớ", { threadId, taskId: target.id, title: target.title });
    return target;
  }

  async checkTasks() {
    const api = this.getApi();
    if (!api) return;
    const now = Date.now();
    const tasks = await this.getAllTasks();

    for (const task of tasks) {
      if (task.nextRunAt && now >= task.nextRunAt) {
        await this.executeTask(task, api);
        const intervalMs = Math.max(1, Number(task.intervalMinutes) || 1440) * 60_000;
        const nextRunAt = now + intervalMs;
        await this.store.update(`scheduled_tasks/${task.threadId}/${task.id}`, {
          lastRunAt: now,
          nextRunAt
        });
      }
    }
  }

  async executeTask(task, api) {
    this.logger.info("Thực thi mệnh lệnh lặp", { threadId: task.threadId, taskId: task.id, type: task.type });
    try {
      if (task.type === "weather") {
        const weather = await fetchWeather(task.location || "Hà Nội");
        const msgText = `⏰ [MỆNH LỆNH TỰ ĐỘNG]\n${weather.summary}`;
        await api.sendMessage({ msg: msgText }, String(task.threadId), 1);
      } else if (task.type === "custom_message" || task.type === "ai_prompt") {
        const msgText = `⏰ [MỆNH LỆNH TỰ ĐỘNG]\n${task.message || task.title}`;
        await api.sendMessage({ msg: msgText }, String(task.threadId), 1);
      }
    } catch (error) {
      this.logger.error("Lỗi khi thực thi mệnh lệnh lặp", { taskId: task.id, error: error.message });
    }
  }
}
