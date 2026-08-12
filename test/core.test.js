import test from "node:test";
import assert from "node:assert/strict";
import { containsLink, findImageUrls } from "../src/modules/antiLink.js";
import { clearSpamState, clearSpamUser, detectSpam } from "../src/modules/antiSpam.js";
import { parseDuration } from "../src/modules/group.js";
import { handleAdmin } from "../src/modules/admin.js";
import { GeminiClient } from "../src/modules/gemini.js";
import { parseSpamMessage } from "../src/modules/spamMessage.js";
import { fetchWeather } from "../src/modules/weather.js";
import { TaskScheduler } from "../src/modules/taskScheduler.js";
import { handleDeleteMasterCommand, handleMasterCommand } from "../src/modules/masterCommand.js";

test("parseDuration hiểu thời lượng Việt", () => { assert.equal(parseDuration("2:00"), 7_200_000); assert.equal(parseDuration("3d"), 259_200_000); assert.equal(parseDuration("30p"), 1_800_000); assert.equal(parseDuration("45s"), 45_000); assert.equal(parseDuration("1d2h30p10s"), 95_410_000); assert.equal(parseDuration("1h30m"), 5_400_000); assert.equal(parseDuration("hello"), null); });
test("containsLink nhận biết URL, preview và né lọc", () => {
  assert.equal(containsLink("xem https://sangdev.online"), true);
  assert.equal(containsLink("truy cập sangdev . online nhé"), true);
  assert.equal(containsLink("hxxps://example.com"), true);
  assert.equal(containsLink({ title: "Trang", href: "https://example.com/a" }), true);
  assert.equal(containsLink("xin chào"), false);
  assert.equal(containsLink("", { msgType: "chat.qr" }), false);
});
test("anti-link không xóa nhầm dấu chấm và metadata kỹ thuật", () => {
  for (const text of [".", "...", "xin chào.", "phiên bản 1.2.3", "tôi thích . com", "giá 10.000 đồng"]) assert.equal(containsLink(text), false, text);
  assert.equal(containsLink("tin bình thường", { params: "https://internal.zalo.me/tracking", quote: { attach: "https://cdn.zalo.me/a.jpg" } }), false);
  assert.equal(containsLink("abc.com"), true);
  assert.equal(containsLink("sub.domain.vn/path"), true);
});
test("anti-link không nhầm URL CDN ảnh là link", () => {
  const photo = { content: { title: "ảnh thường", thumb: "https://cdn.zalo.me/photo.jpg" }, msgType: "chat.photo" };
  assert.equal(containsLink(photo.content, photo), false);
  assert.deepEqual(findImageUrls(photo), ["https://cdn.zalo.me/photo.jpg"]);
});
test("ảnh có href CDN không bị xóa nếu không có QR link", () => {
  const samples = [
    { msgType: "chat.photo", content: { href: "https://photo-zalo-zadn.vn/image.jpg", thumb: "https://photo-zalo-zadn.vn/thumb.jpg" } },
    { msgType: "chat.image", content: { href: "https://cdn.example.com/image.webp", title: "Ảnh du lịch" } },
    { msgType: "chat.gif", content: { url: "https://cdn.example.com/animation.gif" } },
    { msgType: "chat.sticker", content: { href: "https://cdn.example.com/sticker.png" } }
  ];
  for (const message of samples) assert.equal(containsLink(message.content, message), false, message.msgType);
  assert.deepEqual(findImageUrls(samples[0]), ["https://photo-zalo-zadn.vn/image.jpg", "https://photo-zalo-zadn.vn/thumb.jpg"]);
});
test("detectSpam nhận biết 10 tin trong 5 giây", () => { clearSpamState(); for (let i = 0; i < 9; i++) assert.equal(detectSpam("g:u", String(i), i * 100), false); assert.equal(detectSpam("g:u", "9", 900), true); });
test("clearSpamUser reset bộ đếm khi thành viên vào lại", () => { clearSpamState(); for (let i = 0; i < 9; i++) detectSpam("group:user", String(i), i); clearSpamUser("group", "user"); assert.equal(detectSpam("group:user", "mới", 10), false); });
test("admin add lấy UID từ mention thay vì bắt nhập ID", async () => {
  let saved; const content = "'admin add @Nguyễn Văn A"; const pos = content.indexOf("@Nguyễn");
  const ctx = { isOwner: true, senderId: "owner", prefix: "'", content, message: { data: { mentions: [{ uid: "123456789", pos, len: "@Nguyễn Văn A".length }] } }, store: { set: async (key, value) => { saved = { key, value }; }, get: async () => ({}) }, reply: async () => true };
  await handleAdmin(ctx, ["add", "@Nguyễn", "Văn", "A"]); assert.equal(saved.key, "admins/123456789"); assert.equal(saved.value.name, "Nguyễn Văn A");
});
test("cut admin xóa vai trò admin bằng mention", async () => {
  let removedKey; const content = "'cut admin @Nguyễn Văn A"; const pos = content.indexOf("@Nguyễn");
  const ctx = { isOwner: true, senderId: "owner", prefix: "'", content, message: { data: { mentions: [{ uid: "987654321", pos, len: "@Nguyễn Văn A".length }] } }, store: { remove: async (key) => { removedKey = key; } }, reply: async () => true };
  await handleAdmin(ctx, ["cut", "admin", "@Nguyễn", "Văn", "A"]);
  assert.equal(removedKey, "admins/987654321");
});
test("GeminiClient báo lỗi khóa API rõ ràng khi sai token", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "Request had invalid authentication credentials. Expected OAuth 2 access token..." } })
  });
  const client = new GeminiClient({ apiKey: "bad-token", fetchImpl: fakeFetch });
  await assert.rejects(
    async () => client.ask({ prompt: "Test", userId: "u", userName: "A", threadId: "t" }),
    (err) => /Khóa GEMINI_API_KEY trong file \.env chưa hợp lệ/i.test(err.message)
  );
});
test("GeminiClient gửi prompt và đọc câu trả lời", async () => { const fakeFetch = async (_url, options) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "Xin chào bạn" }] } }] }), request: JSON.parse(options.body) }); const client = new GeminiClient({ apiKey: "test", fetchImpl: fakeFetch }); assert.equal(await client.ask({ prompt: "Chào", userId: "u", userName: "An", threadId: "g" }), "Xin chào bạn"); });
test("parseSpamMessage hiểu cú pháp đơn giản", () => { assert.deepEqual(parseSpamMessage("Xin chào mọi người 5"), { content: "Xin chào mọi người", count: 5 }); assert.deepEqual(parseSpamMessage("+Cú pháp cũ+{3}"), { content: "Cú pháp cũ", count: 3 }); assert.equal(parseSpamMessage("Xin chào"), null); assert.equal(parseSpamMessage("Nội dung 0"), null); });

// Tests cho tính năng mới: Thời tiết, TaskScheduler, 'ml & 'de-ml
test("fetchWeather đọc dữ liệu thời tiết giả lập", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      current_condition: [{ temp_C: "28", FeelsLikeC: "30", humidity: "75", weatherDesc: [{ value: "Nắng nhẹ" }], windspeedKmph: "15" }],
      nearest_area: [{ areaName: [{ value: "Ha Noi" }], country: [{ value: "Vietnam" }] }],
      weather: [{ maxtempC: "32", mintempC: "25" }]
    })
  });
  const res = await fetchWeather("Hà Nội", fakeFetch);
  assert.equal(res.ok, true);
  assert.equal(res.temp, "28°C");
  assert.match(res.summary, /THỜI TIẾT TẠI HA NOI/);
});

test("TaskScheduler thêm và hủy mệnh lệnh lặp", async () => {
  const mockData = {};
  const mockStore = {
    set: async (key, val) => {
      const parts = key.split("/").filter(Boolean);
      let cursor = mockData;
      for (let i = 0; i < parts.length - 1; i++) { cursor[parts[i]] ??= {}; cursor = cursor[parts[i]]; }
      cursor[parts.at(-1)] = val;
      return val;
    },
    get: async (key, fallback = null) => {
      const parts = key.split("/").filter(Boolean);
      const val = parts.reduce((v, p) => v?.[p], mockData);
      return val ?? fallback;
    },
    remove: async (key) => {
      const parts = key.split("/").filter(Boolean);
      const parent = parts.slice(0, -1).reduce((v, p) => v?.[p], mockData);
      if (parent) delete parent[parts.at(-1)];
    }
  };
  const logger = { info: () => {}, error: () => {} };
  const scheduler = new TaskScheduler({ store: mockStore, getApi: () => null, logger });

  const task = await scheduler.addTask({ threadId: "123", title: "Dự báo thời tiết hằng ngày", type: "weather", location: "Hà Nội", intervalMinutes: 1440, createdBy: "admin1" });
  assert.equal(task.title, "Dự báo thời tiết hằng ngày");
  assert.equal(task.intervalMinutes, 1440);

  const tasks = await scheduler.getTasksForThread("123");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, task.id);

  const deleted = await scheduler.deleteTaskByIndex("123", 1);
  assert.equal(deleted.id, task.id);

  const afterDelete = await scheduler.getTasksForThread("123");
  assert.equal(afterDelete.length, 0);
});

test("handleMasterCommand và handleDeleteMasterCommand hoạt động đúng", async () => {
  let repliedTitle = "";
  let repliedLines = [];
  const kickedUsers = [];
  const mockData = {};
  const mockStore = {
    set: async (key, val) => {
      const parts = key.split("/").filter(Boolean);
      let cursor = mockData;
      for (let i = 0; i < parts.length - 1; i++) { cursor[parts[i]] ??= {}; cursor = cursor[parts[i]]; }
      cursor[parts.at(-1)] = val;
      return val;
    },
    get: async (key, fallback = null) => {
      const parts = key.split("/").filter(Boolean);
      const val = parts.reduce((v, p) => v?.[p], mockData);
      return val ?? fallback;
    },
    remove: async (key) => {
      const parts = key.split("/").filter(Boolean);
      const parent = parts.slice(0, -1).reduce((v, p) => v?.[p], mockData);
      if (parent) delete parent[parts.at(-1)];
    }
  };
  const logger = { info: () => {}, error: () => {} };
  const scheduler = new TaskScheduler({ store: mockStore, getApi: () => null, logger });

  const fakeGemini = {
    askMaster: async ({ prompt }) => {
      if (prompt.includes("kích")) {
        return { text: "", functionCalls: [{ name: "kick_user", args: { userIds: ["99999"] } }] };
      }
      return { text: "Đã xử lý", functionCalls: [] };
    }
  };

  const ctx = {
    isAdmin: true,
    senderId: "admin",
    threadId: "g1",
    prefix: "'",
    scheduler,
    gemini: fakeGemini,
    kick: async (groupId, userId) => { kickedUsers.push({ groupId, userId }); },
    message: { data: { mentions: [{ uid: "99999", pos: 0, len: 10 }] } },
    reply: async (title, lines) => { repliedTitle = title; repliedLines = lines; return true; }
  };

  // Test 'ml kích @Tên
  await handleMasterCommand(ctx, "kích @Nguyễn Văn A");
  assert.equal(repliedTitle, "MỆNH LỆNH AI");
  assert.equal(kickedUsers.length, 1);
  assert.equal(kickedUsers[0].userId, "99999");

  // Test 'de-ml xem danh sách khi chưa có
  await handleDeleteMasterCommand(ctx, []);
  assert.equal(repliedTitle, "MỆNH LỆNH GHI NHỚ");
  assert.match(repliedLines[0], /không có mệnh lệnh/);
});
