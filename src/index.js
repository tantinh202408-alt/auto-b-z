import { loadConfig } from "./config.js";
import { createStore } from "./firebase.js";
import { SangdevBot } from "./bot.js";
import { logger } from "./utils/logger.js";
import { startDashboard } from "./web.js";

let bot;
async function main() { const config = await loadConfig(); const store = await createStore(config); bot = new SangdevBot(config, store, logger); await bot.start(); startDashboard({ config, store, bot, logger }); }
process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", reason));
process.on("uncaughtException", (error) => logger.error("Uncaught exception", error));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { logger.info(`Nhận ${signal}, đang dừng bot`); bot?.stop(); process.exit(0); });
main().catch((error) => { logger.error("Không thể khởi động SANGDEV BOT", error); process.exitCode = 1; });
