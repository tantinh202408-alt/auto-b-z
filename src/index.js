import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { createStore } from "./firebase.js";
import { SangdevBot } from "./bot.js";
import { logger } from "./utils/logger.js";
import { startDashboard } from "./web.js";

let bot;
let cleanerInterval;

async function cleanOldTmpFiles(rootDir) {
  const tmpDir = path.join(rootDir, "tmp");
  try {
    const files = await fs.readdir(tmpDir);
    const now = Date.now();
    for (const file of files) {
      const fullPath = path.join(tmpDir, file);
      try {
        const stat = await fs.stat(fullPath);
        // Tự động xóa file tạm trên 5 phút để tiết kiệm dung lượng hosting 1.000 MB
        if (now - stat.mtimeMs > 5 * 60 * 1000) {
          await fs.unlink(fullPath).catch(() => {});
        }
      } catch {}
    }
  } catch {}
}

async function main() {
  const config = await loadConfig();
  const store = await createStore(config);
  bot = new SangdevBot(config, store, logger);
  await bot.start();
  startDashboard({ config, store, bot, logger });

  // Dọn dẹp định kỳ 10 phút một lần
  cleanerInterval = setInterval(() => cleanOldTmpFiles(config.root), 10 * 60 * 1000);
  cleanOldTmpFiles(config.root).catch(() => {});
}

process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", reason));
process.on("uncaughtException", (error) => logger.error("Uncaught exception", error));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    logger.info(`Nhận ${signal}, đang dừng bot`);
    if (cleanerInterval) clearInterval(cleanerInterval);
    bot?.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error("Không thể khởi động SANGDEV BOT", error);
  process.exitCode = 1;
});

