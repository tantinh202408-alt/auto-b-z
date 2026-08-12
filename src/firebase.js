import fs from "node:fs/promises";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { logger } from "./utils/logger.js";

class LocalStore {
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

class FirebaseStore {
  constructor(db) { this.db = db; }
  async get(key, fallback = null) { const snapshot = await this.db.ref(key).get(); return snapshot.exists() ? snapshot.val() : fallback; }
  async set(key, value) { await this.db.ref(key).set(value); return value; }
  async update(key, value) { await this.db.ref(key).update(value); return value; }
  async remove(key) { await this.db.ref(key).remove(); }
  async increment(key, amount = 1) { const result = await this.db.ref(key).transaction((v) => Number(v || 0) + amount); return result.snapshot.val(); }
}

export async function createStore(config) {
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
      const credential = cert(serviceAccount);
      const app = getApps()[0] || initializeApp({ credential, databaseURL: config.firebaseUrl });
      const store = new FirebaseStore(getDatabase(app));
      // Thực hiện một lần đọc để xác minh credential trước khi báo kết nối thành công.
      await store.get("settings", {});
      logger.info("Đã xác thực và kết nối Firebase Realtime Database");
      return store;
    } catch (error) { logger.warn(`Firebase chưa sẵn sàng, dùng kho local: ${error.message}`); }
  }
  return new LocalStore(path.join(config.root, "data", "database.json")).init();
}
