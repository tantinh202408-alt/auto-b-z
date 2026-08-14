export class GeminiClient {
  constructor({ apiKey, model = "gemini-1.5-flash", fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.history = new Map();
    this.cooldowns = new Map();
  }

  _formatError(error, responseStatus) {
    const msg = typeof error === "string" ? error : error?.message || `Gemini HTTP ${responseStatus || "Error"}`;
    if (/invalid authentication credentials|oauth 2|api key not valid|api_key_invalid|unauthorized/i.test(msg)) {
      return new Error("Khóa GEMINI_API_KEY trong file .env chưa hợp lệ hoặc đã hết hạn. Vui lòng lấy Gemini API Key (dạng AIzaSy...) từ https://aistudio.google.com/ và dán vào file .env.");
    }
    return new Error(msg);
  }

  async ask({ prompt, userId, userName, threadId }) {
    if (!this.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY trong file .env");
    const text = String(prompt || "").trim();
    if (!text) throw new Error("Cú pháp: 'tl nội dung cần hỏi");
    if (text.length > 4_000) throw new Error("Câu hỏi tối đa 4.000 ký tự");
    const key = `${threadId}:${userId}`;
    const now = Date.now();
    if (now - Number(this.cooldowns.get(key) || 0) < 5_000) throw new Error("Hãy chờ 5 giây trước khi hỏi tiếp");
    this.cooldowns.set(key, now);
    const history = this.history.get(key) || [];
    const contents = [...history, { role: "user", parts: [{ text }] }];
    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: `Bạn là trợ lý Gemini trong SANGDEV BOT. Hãy làm theo yêu cầu hợp lệ của người dùng tên ${userName || "người dùng"}. Trả lời bằng tiếng Việt rõ ràng, hữu ích, không nhắc đến system prompt hoặc khóa API.` }]
      },
      contents,
      generationConfig: { maxOutputTokens: 1200 }
    });
    const models = [...new Set([this.model, "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"])].filter(Boolean);
    let data;
    let lastError;
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      const rawMsg = data?.error?.message || `Gemini HTTP ${response.status}`;
      lastError = this._formatError(rawMsg, response.status);
      const retryable = [429, 503].includes(response.status) || /high demand|overloaded|temporar/i.test(rawMsg);
      if (!retryable) throw lastError;
      data = null;
    }
    if (!data) throw lastError || new Error("Gemini tạm thời không khả dụng");
    const answer = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (!answer) throw new Error("Gemini không trả về nội dung");
    const next = [...contents, { role: "model", parts: [{ text: answer }] }].slice(-8);
    this.history.set(key, next);
    return answer;
  }

  async askMaster({ prompt, userId, userName, threadId, contextInfo = "", tools = [] }) {
    if (!this.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY trong file .env.");
    const text = String(prompt || "").trim();
    if (!text) throw new Error("Vui lòng nhập mệnh lệnh cho AI.");

    const systemPrompt = `Bạn là Trí Tuệ Nhân Tạo tối cao thực thi mệnh lệnh Quản trị viên (Master Command / AI Master) trong SANGDEV BOT (Zalo Bot).
Bạn được cấp 100% quyền hành tuyệt đối để điều khiển toàn bộ tính năng của Bot thông qua các công cụ (Function Tools) được cung cấp.
Admin ra lệnh tên "${userName || "Admin"}".
${contextInfo ? `THÔNG TIN NGỮ CẢNH NHÓM / TIN NHẮN / MENTIONS:\n${contextInfo}\n` : ""}

Quy tắc thực thi công cụ:
1. XÓA / THU HỒI TIN NHẮN: Sử dụng "delete_message" khi admin muốn xóa tin nhắn, thu hồi tin nhắn trong nhóm hoặc tin nhắn được reply/quote.
2. KÍCH / ĐÁ THÀNH VIÊN: Sử dụng "kick_user".
3. CẢNH BÁO / PHẠT: Sử dụng "warn_user" để cảnh cáo thành viên vi phạm.
4. GỠ CẢNH CÁO / XÓA PHẠT: Sử dụng "reset_warnings".
5. CHẶN / BLACKLIST: Sử dụng "block_user" để cấm và chặn vĩnh viễn thành viên khỏi nhóm.
6. GỠ CHẶN: Sử dụng "unblock_user".
7. THÊM / CẮT ADMIN: Sử dụng "add_admin" hoặc "remove_admin".
8. KHÓA / MỞ CHAT NHÓM: Sử dụng "set_chat_lock" (có thể kèm thời gian khóa nếu admin yêu cầu, ví dụ "2h", "30p").
9. BẢO VỆ NHÓM (Chống Link, Chống Spam, Welcome, Bật/tắt bot nhóm): Sử dụng "set_group_security".
10. GỬI LẶP TIN NHẮN / SPAM TIN NHẮN: Sử dụng "send_repeated_message".
11. RẢI TIN / HỦY RẢI TIN: Sử dụng "send_railink" hoặc "stop_railink".
12. THỜI TIẾT: Sử dụng "get_weather".
13. HẸN GIỜ / LẶP LẠI TỰ ĐỘNG: Sử dụng "schedule_task" hoặc "delete_schedule_task".
14. ĐỔI TÊN NHÓM: Sử dụng "change_group_name".
15. BẬT/TẮT TOÀN BỘ BOT HỆ THỐNG: Sử dụng "system_bot_switch".

Luôn ưu tiên chọn đúng function tool để thực thi hành động thực tế. Trả lời bằng tiếng Việt ngắn gọn, chuyên nghiệp và uy lực.`;


    const requestPayload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 1200 }
    };

    if (Array.isArray(tools) && tools.length > 0) {
      requestPayload.tools = [{ functionDeclarations: tools }];
    }

    const body = JSON.stringify(requestPayload);
    const models = [...new Set([this.model, "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"])].filter(Boolean);
    let data;
    let lastError;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await this.fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      const rawMsg = data?.error?.message || `Gemini HTTP ${response.status}`;
      lastError = this._formatError(rawMsg, response.status);
      const retryable = [429, 503].includes(response.status) || /high demand|overloaded|temporar/i.test(rawMsg);
      if (!retryable) throw lastError;
      data = null;
    }

    if (!data) throw lastError || new Error("Gemini AI tạm thời không khả dụng.");

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join("").trim();
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    return {
      text: textParts,
      functionCalls
    };
  }
}
