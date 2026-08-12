const priorities = { debug: 10, info: 20, warn: 30, error: 40 };
const selected = process.env.LOG_LEVEL || "info";

function write(level, message, meta) {
  if (priorities[level] < (priorities[selected] ?? 20)) return;
  const record = { time: new Date().toISOString(), level, message };
  if (meta !== undefined) record.meta = meta instanceof Error ? { message: meta.message, stack: meta.stack } : meta;
  const line = JSON.stringify(record);
  (level === "error" ? console.error : console.log)(line);
}

export const logger = Object.freeze({
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta)
});
