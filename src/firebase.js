import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./utils/logger.js";


export class LocalStore {
  constructor(file) { this.file = file; this.data = {}; this.queue = Promise.resolve(); }
  async init() { try { this.data = JSON.parse(await fs.readFile(this.file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; } return this; }
  parts(key) { return key.split("/").filter(Boolean); }
  getValue(key) { return this.parts(key).reduce((value, part) => value?.[part], this.data); }
  async get(key, fallback = null) { return this.getValue(key) ?? fallback; }
  async set(key, value) { let cursor = this.data; const parts = this.parts(key); parts.slice(0, -1).forEach((p) => { cursor[p] ??= {}; cursor = cursor[p]; }); cursor[parts.at(-1)] = value; await this.flush(); return value; }
  async update(key, value) { const current = await this.get(key, {}); return this.set(key, { ...current, ...value }); }
  async remove(key) { const parts = this.parts(key); const parent = parts.slice(0, -1).reduce((v, p) => v?.[p], this.data); if (parent) delete parent[parts.at(-1)]; await this.flush(); }
  async increment(key, amount = 1) { return this.set(key, Number(await this.get(key, 0)) + amount); }
  async flush() { this.queue = this.queue.then(async () => { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(this.file, JSON.stringify(this.data, null, 2)); }); return this.queue; }
}

export class FirebaseStore {
  constructor(db) { this.db = db; }
  async get(key, fallback = null) { const snapshot = await this.db.ref(key).get(); return snapshot.exists() ? snapshot.val() : fallback; }
  async set(key, value) { await this.db.ref(key).set(value); return value; }
  async update(key, value) { await this.db.ref(key).update(value); return value; }
  async remove(key) { await this.db.ref(key).remove(); }
  async increment(key, amount = 1) { const result = await this.db.ref(key).transaction((v) => Number(v || 0) + amount); return result.snapshot.val(); }
}

export class TursoStore {
  constructor({ url, token, tableName = "sangdev_zalo_bot_data" }) {
    this.token = token;
    this.tableName = tableName.replace(/[^a-zA-Z0-9_]/g, "") || "sangdev_zalo_bot_data";
    let normalized = String(url || "").trim();
    if (normalized.startsWith("libsql://")) {
      normalized = normalized.replace("libsql://", "https://");
    }
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }
    this.pipelineUrl = normalized.endsWith("/v2/pipeline") ? normalized : `${normalized.replace(/\/+$/, "")}/v2/pipeline`;
    this.data = {};
  }

  async executeQuery(sql, args = []) {
    const response = await fetch(this.pipelineUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: args.map((arg) => {
                if (arg === null || arg === undefined) return { type: "null" };
                if (typeof arg === "number") return { type: Number.isInteger(arg) ? "integer" : "float", value: String(arg) };
                if (typeof arg === "boolean") return { type: "integer", value: arg ? "1" : "0" };
                return { type: "text", value: String(arg) };
              })
            }
          },
          { type: "close" }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Turso HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const result = data.results?.[0];
    if (result?.type === "error") {
      throw new Error(result.error?.message || "Turso query error");
    }
    return result?.response?.result;
  }

  async init() {
    await this.executeQuery(`CREATE TABLE IF NOT EXISTS ${this.tableName} (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);`);
    const result = await this.executeQuery(`SELECT key, value FROM ${this.tableName};`);
    this.data = {};
    if (result?.rows) {
      for (const row of result.rows) {
        const key = row[0]?.value;
        const rawValue = row[1]?.value;
        if (key && rawValue !== undefined) {
          try {
            const parsed = JSON.parse(rawValue);
            this.setLocal(key, parsed);
          } catch {
            this.setLocal(key, rawValue);
          }
        }
      }
    }
    return this;
  }

  parts(key) { return key.split("/").filter(Boolean); }
  getValue(key) { return this.parts(key).reduce((value, part) => value?.[part], this.data); }

  setLocal(key, value) {
    let cursor = this.data;
    const parts = this.parts(key);
    parts.slice(0, -1).forEach((p) => { cursor[p] ??= {}; cursor = cursor[p]; });
    cursor[parts.at(-1)] = value;
  }

  async get(key, fallback = null) {
    return this.getValue(key) ?? fallback;
  }

  async set(key, value) {
    this.setLocal(key, value);
    const jsonStr = JSON.stringify(value);
    await this.executeQuery(
      `INSERT INTO ${this.tableName} (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`,
      [key, jsonStr, Date.now()]
    );
    return value;
  }

  async update(key, value) {
    const current = await this.get(key, {});
    const updated = typeof current === "object" && current !== null && !Array.isArray(current) && typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...current, ...value }
      : value;
    return this.set(key, updated);
  }

  async remove(key) {
    const parts = this.parts(key);
    const parent = parts.slice(0, -1).reduce((v, p) => v?.[p], this.data);
    if (parent) delete parent[parts.at(-1)];
    await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE key = ? OR key LIKE ?;`,
      [key, `${key}/%`]
    );
  }

  async increment(key, amount = 1) {
    const val = Number(await this.get(key, 0)) + amount;
    await this.set(key, val);
    return val;
  }
}

export async function createStore(config) {
  // 1. Ưu tiên Turso LibSQL Cloud Database
  if (config.tursoDatabaseUrl && config.tursoAuthToken) {
    try {
      const store = new TursoStore({
        url: config.tursoDatabaseUrl,
        token: config.tursoAuthToken,
        tableName: config.tursoTable || "sangdev_zalo_bot_data"
      });
      await store.init();
      logger.info(`Đã kết nối cơ sở dữ liệu Turso (Bảng: ${store.tableName})`);
      return store;
    } catch (error) {
      logger.warn(`Không thể kết nối Turso Database: ${error.message}`);
    }
  }

  // 2. Dự phòng Firebase Realtime Database
  if (config.firebaseUrl) {
    try {
      let serviceAccount;
      if (config.firebaseServiceAccountJson) {
        try { serviceAccount = typeof config.firebaseServiceAccountJson === "object" ? config.firebaseServiceAccountJson : JSON.parse(config.firebaseServiceAccountJson); }
        catch (e) { throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ: ${e.message}`); }
      } else {
        try { serviceAccount = JSON.parse(await fs.readFile(config.serviceAccountPath, "utf8")); }
        catch (error) {
          if (error.code === "ENOENT") throw new Error(`Không tìm thấy Firebase Admin key: ${config.serviceAccountPath}`);
          throw new Error(`Không đọc được Firebase Admin key: ${error.message}`);
        }
      }
      if (serviceAccount.type !== "service_account" || !serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("Dữ liệu Firebase service account không phải private key hợp lệ");
      }
      const { cert, getApps, initializeApp } = await import("firebase-admin/app");
      const { getDatabase } = await import("firebase-admin/database");
      const credential = cert(serviceAccount);
      const app = getApps()[0] || initializeApp({ credential, databaseURL: config.firebaseUrl });
      const store = new FirebaseStore(getDatabase(app));
      await store.get("settings", {});
      logger.info("Đã xác thực và kết nối Firebase Realtime Database");
      return store;
    } catch (error) { logger.warn(`Firebase chưa sẵn sàng, dùng kho local: ${error.message}`); }
  }

  // 3. Fallback Local JSON database
  return new LocalStore(path.join(config.root, "data", "database.json")).init();
}

