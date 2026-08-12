export class GeminiClient {
  constructor({ apiKey, model = "gemini-flash-latest", fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.history = new Map();
    this.cooldowns = new Map();
  }

  async ask({ prompt, userId, userName, threadId }) {
    if (!this.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY");
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
    const models = [...new Set([this.model, "gemini-2.5-flash", "gemini-1.5-flash"])];
    let data;
    let lastError;
    for (const model of models) {
      const response = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      lastError = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
      const retryable = [429, 503].includes(response.status) || /high demand|overloaded|temporar/i.test(lastError.message);
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
    if (!this.apiKey) throw new Error("Chưa cấu hình GEMINI_API_KEY trong hệ thống.");
    const text = String(prompt || "").trim();
    if (!text) throw new Error("Vui lòng nhập mệnh lệnh cho AI.");

    const systemPrompt = `Bạn là Trí Tuệ Nhân Tạo thực thi mệnh lệnh quản trị trong SANGDEV BOT (Zalo Bot).
Bạn có đầy đủ quyền hạn để thực thi các yêu cầu của Quản trị viên (Admin) tên "${userName || "Admin"}".
${contextInfo ? `THÔNG TIN NGHỮ CẢNH NHÓM/TIN NHẮN:\n${contextInfo}\n` : ""}
Nhiệm vụ của bạn:
1. Phân tích mệnh lệnh của Admin.
2. Nếu mệnh lệnh yêu cầu KÍCH thành viên: Sử dụng công cụ "kick_user". Đảm bảo lấy đúng UID của thành viên được tag hoặc nhắc tới trong ngữ cảnh.
3. Nếu mệnh lệnh yêu cầu THỜI TIẾT: Sử dụng công cụ "get_weather" để lấy thông tin thời tiết địa điểm đó.
4. Nếu mệnh lệnh yêu cầu GHI NHỚ MỆNH LỆNH THỜI GIAN / HẸN GIỜ LẶP LẠI (ví dụ: "kiểm tra thời tiết hằng ngày", "mỗi ngày 7h gửi thời tiết", "rải tin nhắn 2 giờ một lần"): Sử dụng công cụ "schedule_task" với khoảng thời gian thích hợp (1440 phút cho hằng ngày, 60 phút cho hằng giờ,...).
5. Nếu mệnh lệnh yêu cầu KHÓA/MỞ CHAT nhóm: Sử dụng công cụ "set_chat_lock".
6. Nếu mệnh lệnh khác: Trả lời ngắn gọn, chuyên nghiệp và thực hiện yêu cầu.
Hãy luôn trả lời bằng tiếng Việt lịch sự, rõ ràng.`;

    const requestPayload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 1200 }
    };

    if (Array.isArray(tools) && tools.length > 0) {
      requestPayload.tools = [{ functionDeclarations: tools }];
    }

    const body = JSON.stringify(requestPayload);
    const models = [...new Set([this.model, "gemini-2.5-flash", "gemini-1.5-flash"])];
    let data;
    let lastError;

    for (const model of models) {
      const response = await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      lastError = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
      const retryable = [429, 503].includes(response.status) || /high demand|overloaded|temporar/i.test(lastError.message);
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
