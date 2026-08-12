import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

function normalizeCookie(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* Browser cookie string is handled below. */ }
  return value.split(";").map((part) => {
    const index = part.indexOf("=");
    return index > 0 ? { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim(), domain: ".zalo.me", path: "/" } : null;
  }).filter(Boolean);
}

export async function loadConfig() {
  let file = {};
  try { file = JSON.parse(await fs.readFile(path.join(ROOT, "config.json"), "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error(`config.json không hợp lệ: ${error.message}`);
  }
  const config = {
    root: ROOT,
    cookie: normalizeCookie(file.cookie || process.env.ZALO_COOKIE),
    imei: file.imei || process.env.ZALO_IMEI || "",
    userAgent: file.userAgent || process.env.ZALO_USER_AGENT || "",
    token: file.token || process.env.ZALO_TOKEN || "",
    prefix: file.prefix || process.env.BOT_PREFIX || "'",
    ownerId: String(process.env.OWNER_ID || file.ownerId || ""),
    dashboardPort: Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000),
    dashboardToken: process.env.DASHBOARD_TOKEN || "",
    geminiApiKey: process.env.GEMINI_API_KEY || file.geminiApiKey || "",
    geminiModel: process.env.GEMINI_MODEL || file.geminiModel || "gemini-flash-latest",
    firebaseUrl: process.env.FIREBASE_DATABASE_URL || "",
    serviceAccountPath: path.resolve(ROOT, process.env.FIREBASE_SERVICE_ACCOUNT || "service-account.json"),
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ""
  };
  if (!config.prefix.trim()) throw new Error("Prefix không được để trống");
  return Object.freeze(config);
}
