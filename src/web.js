import express from "express";
import path from "node:path";
import multer from "multer";

const allowedGroupFields = new Set(["status", "welcome", "antisp", "antilink"]);

export function startDashboard({ config, store, bot, logger }) {
  const app = express(); app.disable("x-powered-by"); app.use(express.json({ limit: "128kb" }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) });
  const html = path.join(config.root, "dashboard", "index.html");
  app.get("/", (_req, res) => res.sendFile(html));
  app.get("/health", (_req, res) => res.json({ ok: true, zalo: Boolean(bot.api) }));
  app.use("/api", (req, res, next) => { const token = req.get("authorization")?.replace(/^Bearer\s+/i, "") || req.query.token; if (config.dashboardToken && token !== config.dashboardToken) return res.status(401).json({ error: "Token không hợp lệ" }); next(); });
  app.get("/api/snapshot", async (_req, res, next) => { try { const [settings, groups, admins, warnings, logs, conversations] = await Promise.all([store.get("settings", {}), store.get("groups", {}), store.get("admins", {}), store.get("warnings", {}), store.get("logs", {}), bot.getDashboardConversations()]); res.json({ connected: Boolean(bot.api), settings, groups, admins, warnings, logs: Object.entries(logs).slice(-100).reverse(), conversations, messages: bot.getWebMessages() }); } catch (e) { next(e); } });
  app.get("/api/messages/:threadId", (req, res) => res.json(bot.getWebMessages(req.params.threadId)));
  app.post("/api/messages", async (req, res, next) => { try { await bot.sendDashboardMessage(req.body); res.json({ ok: true }); } catch (e) { next(e); } });
  app.post("/api/messages/image", upload.single("image"), async (req, res, next) => { try { if (!req.file) throw new Error("Chỉ hỗ trợ JPG, PNG, WebP hoặc GIF tối đa 10 MB"); await bot.sendDashboardImage({ threadId: req.body.threadId, type: req.body.type, caption: req.body.caption, buffer: req.file.buffer, originalName: req.file.originalname }); res.json({ ok: true }); } catch (e) { next(e); } });
  app.patch("/api/settings", async (req, res, next) => { try { if (typeof req.body.botEnabled === "boolean") await store.set("settings/botEnabled", req.body.botEnabled); res.json({ ok: true }); } catch (e) { next(e); } });
  app.patch("/api/groups/:id", async (req, res, next) => { try { const values = Object.fromEntries(Object.entries(req.body).filter(([key, value]) => allowedGroupFields.has(key) && typeof value === "boolean")); await store.update(`groups/${req.params.id}`, { ...values, updatedAt: Date.now() }); res.json({ ok: true }); } catch (e) { next(e); } });
  app.post("/api/railink", async (req, res, next) => { try { const { content, duration, delay } = req.body; await bot.railink.create(`${String(content || "").trim()} ${duration} ${delay}`, config.ownerId); res.json({ ok: true }); } catch (e) { next(e); } });
  app.delete("/api/railink", async (_req, res, next) => { try { await bot.railink.stop(); res.json({ ok: true }); } catch (e) { next(e); } });
  app.post("/api/admins/:id", async (req, res, next) => { try { await store.set(`admins/${req.params.id}`, { id: req.params.id, addedAt: Date.now(), addedBy: "dashboard" }); res.json({ ok: true }); } catch (e) { next(e); } });
  app.delete("/api/admins/:id", async (req, res, next) => { try { await store.remove(`admins/${req.params.id}`); res.json({ ok: true }); } catch (e) { next(e); } });
  app.use((error, _req, res, _next) => { logger.error("Dashboard API error", error); res.status(400).json({ error: error.message || "Yêu cầu thất bại" }); });
  const server = app.listen(config.dashboardPort, "0.0.0.0", () => logger.info(`Dashboard: http://0.0.0.0:${config.dashboardPort}`));
  return server;
}
