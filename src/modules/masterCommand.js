import { fetchWeather } from "./weather.js";

const MASTER_TOOLS = [
  {
    name: "kick_user",
    description: "Kích (xóa) một hoặc nhiều thành viên ra khỏi nhóm chat",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần kích ra khỏi nhóm"
        },
        reason: { type: "STRING", description: "Lý do kích thành viên" }
      },
      required: ["userIds"]
    }
  },
  {
    name: "remove_admin",
    description: "Xóa vai trò admin (cắt admin) của thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần xóa vai trò admin"
        }
      },
      required: ["userIds"]
    }
  },
  {
    name: "add_admin",
    description: "Thêm vai trò admin cho thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần thêm vai trò admin"
        }
      },
      required: ["userIds"]
    }
  },
  {
    name: "get_weather",
    description: "Lấy dự báo thời tiết cho địa điểm/tỉnh thành",
    parameters: {
      type: "OBJECT",
      properties: {
        location: { type: "STRING", description: "Tên thành phố hoặc tỉnh thành (ví dụ: Hà Nội, TP.HCM, Đà Nẵng)" }
      },
      required: ["location"]
    }
  },
  {
    name: "schedule_task",
    description: "Tạo mệnh lệnh tự động lặp lại theo thời gian (như báo thời tiết hằng ngày, gửi tin nhắc nhở)",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Tên ngắn gọn của mệnh lệnh" },
        type: { type: "STRING", description: "Loại công việc: 'weather' (thời tiết) hoặc 'custom_message' (tin nhắn)" },
        location: { type: "STRING", description: "Địa điểm thời tiết nếu có (ví dụ Hà Nội)" },
        message: { type: "STRING", description: "Nội dung tin nhắn cần lặp lại nếu có" },
        intervalMinutes: { type: "NUMBER", description: "Khoảng thời gian lặp lại tính theo phút (1440 = 24 giờ / hằng ngày, 60 = 1 giờ)" }
      },
      required: ["title", "type", "intervalMinutes"]
    }
  },
  {
    name: "set_chat_lock",
    description: "Khóa hoặc mở quyền nhắn tin trong nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        lock: { type: "BOOLEAN", description: "true để khóa chat, false để mở chat" }
      },
      required: ["lock"]
    }
  }
];

export async function handleMasterCommand(ctx, body) {
  if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ Admin hoặc Owner mới có quyền ra mệnh lệnh AI ('ml)."]);

  const commandText = body.trim();
  if (!commandText) {
    return ctx.reply("HƯỚNG DẪN MỆNH LỆNH ('ml)", [
      `Cú pháp: ${ctx.prefix}ml <mệnh lệnh yêu cầu>`,
      "Ví dụ:",
      `• ${ctx.prefix}ml kích @Tên - Kích thành viên được tag ra khỏi nhóm`,
      `• ${ctx.prefix}ml cut admin @Tên - Xóa vai trò admin của thành viên được tag`,
      `• ${ctx.prefix}ml kiểm tra dự báo thời tiết Hà Nội - Báo thời tiết hiện tại`,
      `• ${ctx.prefix}ml kiểm tra dự báo thời tiết hằng ngày - Tự động báo thời tiết mỗi ngày`,
      `• ${ctx.prefix}ml khóa nhóm / mở nhóm - Đóng hoặc mở chat nhóm`,
      `---`,
      `Hủy mệnh lệnh đã ghi nhớ: ${ctx.prefix}de-ml`
    ]);
  }

  // Thu thập thông tin mentions (tag người dùng)
  const mentions = ctx.message?.data?.mentions || [];
  const mentionDetails = mentions.map((m) => ({ uid: String(m.uid || ""), pos: m.pos, len: m.len }));
  const mentionUids = mentionDetails.map((m) => m.uid).filter(Boolean);

  let contextInfo = `Nhóm ID: ${ctx.threadId}\nAdmin ra lệnh: ${ctx.senderId}`;
  if (mentionUids.length) {
    contextInfo += `\nThành viên được tag (@): ${mentionUids.join(", ")}`;
  }

  try {
    const aiResult = await ctx.gemini.askMaster({
      prompt: commandText,
      userId: ctx.senderId,
      userName: ctx.message?.data?.dName || "Admin",
      threadId: ctx.threadId,
      contextInfo,
      tools: MASTER_TOOLS
    });

    const results = [];
    const functionCalls = aiResult.functionCalls || [];

    // Fallback intent detection nếu AI không tạo functionCall rõ ràng nhưng câu lệnh mang ý định trực tiếp
    const lowerText = commandText.toLowerCase();
    if (!functionCalls.length) {
      if ((lowerText.includes("cắt admin") || lowerText.includes("xóa admin") || lowerText.includes("cut admin")) && mentionUids.length) {
        functionCalls.push({ name: "remove_admin", args: { userIds: mentionUids } });
      } else if ((lowerText.includes("thêm admin") || lowerText.includes("add admin")) && mentionUids.length) {
        functionCalls.push({ name: "add_admin", args: { userIds: mentionUids } });
      } else if ((lowerText.includes("kích") || lowerText.includes("kick") || lowerText.includes("xóa")) && mentionUids.length) {
        functionCalls.push({ name: "kick_user", args: { userIds: mentionUids, reason: commandText } });
      } else if (lowerText.includes("thời tiết") || lowerText.includes("dự báo")) {
        const isScheduled = lowerText.includes("hằng ngày") || lowerText.includes("mỗi ngày") || lowerText.includes("định kỳ") || lowerText.includes("mỗi giờ");
        const locationMatch = commandText.match(/(?:tại|ở|tỉnh|thành phố)\s+([a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]+)/i);
        const loc = locationMatch?.[1]?.trim() || "Hà Nội";
        if (isScheduled) {
          functionCalls.push({
            name: "schedule_task",
            args: {
              title: `Dự báo thời tiết hằng ngày (${loc})`,
              type: "weather",
              location: loc,
              intervalMinutes: 1440
            }
          });
        } else {
          functionCalls.push({ name: "get_weather", args: { location: loc } });
        }
      }
    }

    // Thực thi các Function Tools do AI yêu cầu
    for (const call of functionCalls) {
      const name = call.name;
      const args = call.args || {};

      if (name === "kick_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("⚠️ Không tìm thấy UID thành viên cần kích. Hãy tag @Tên khi ra lệnh.");
        } else {
          for (const uid of targetIds) {
            await ctx.kick(ctx.threadId, uid);
            results.push(`🚫 Đã kích thành viên UID: ${uid} ra khỏi nhóm.`);
          }
        }
      } else if (name === "remove_admin") {
        if (!ctx.isOwner) {
          results.push("⚠️ Chỉ Owner mới có quyền xóa admin.");
        } else {
          const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
          if (!targetIds.length) {
            results.push("⚠️ Không tìm thấy UID thành viên cần xóa admin. Hãy tag @Tên.");
          } else {
            for (const uid of targetIds) {
              await ctx.store.remove(`admins/${uid}`);
              results.push(`❌ Đã xóa vai trò admin của UID: ${uid}`);
            }
          }
        }
      } else if (name === "add_admin") {
        if (!ctx.isOwner) {
          results.push("⚠️ Chỉ Owner mới có quyền thêm admin.");
        } else {
          const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
          if (!targetIds.length) {
            results.push("⚠️ Không tìm thấy UID thành viên cần thêm admin. Hãy tag @Tên.");
          } else {
            for (const uid of targetIds) {
              await ctx.store.set(`admins/${uid}`, { id: uid, name: `Admin_${uid}`, addedAt: Date.now(), addedBy: ctx.senderId });
              results.push(`✅ Đã thêm vai trò admin cho UID: ${uid}`);
            }
          }
        }
      } else if (name === "get_weather") {
        const loc = args.location || "Hà Nội";
        const weather = await fetchWeather(loc);
        results.push(weather.summary);
      } else if (name === "schedule_task") {
        if (!ctx.scheduler) {
          results.push("⚠️ Hệ thống TaskScheduler chưa được khởi tạo.");
        } else {
          const task = await ctx.scheduler.addTask({
            threadId: ctx.threadId,
            title: args.title || "Mệnh lệnh tự động",
            type: args.type || "weather",
            location: args.location || "Hà Nội",
            message: args.message || "",
            intervalMinutes: args.intervalMinutes || 1440,
            createdBy: ctx.senderId
          });
          results.push(`📌 ĐÃ GHI NHỚ MỆNH LỆNH:\n- Tiêu đề: ${task.title}\n- Tần suất: Lặp lại mỗi ${task.intervalMinutes} phút (${(task.intervalMinutes / 60).toFixed(1)} giờ)\n- Hủy mệnh lệnh bằng: ${ctx.prefix}de-ml`);
        }
      } else if (name === "set_chat_lock") {
        const lock = Boolean(args.lock);
        await ctx.setGroupChat(!lock);
        results.push(lock ? "🔒 Đã khóa quyền nhắn tin trong nhóm." : "🔓 Đã mở lại quyền nhắn tin cho nhóm.");
      }
    }

    if (aiResult.text && !results.length) {
      results.push(aiResult.text);
    }

    if (!results.length) {
      results.push("Đã tiếp nhận mệnh lệnh nhưng không tìm thấy hành động phù hợp. Hãy kiểm tra lại cú pháp.");
    }

    return ctx.reply("MỆNH LỆNH AI", results);
  } catch (error) {
    return ctx.reply("LỖI MỆNH LỆNH AI", [`Không thể thực thi mệnh lệnh: ${error.message}`]);
  }
}

export async function handleDeleteMasterCommand(ctx, args) {
  if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ Admin hoặc Owner mới có quyền hủy mệnh lệnh ('de-ml)."]);
  if (!ctx.scheduler) return ctx.reply("LỖI HỆ THỐNG", ["TaskScheduler chưa được kích hoạt."]);

  const tasks = await ctx.scheduler.getTasksForThread(ctx.threadId);
  if (!tasks.length) {
    return ctx.reply("MỆNH LỆNH GHI NHỚ", ["Hiện tại nhóm không có mệnh lệnh tự động nào được ghi nhớ."]);
  }

  const rawArg = args[0]?.trim();
  if (!rawArg) {
    const lines = tasks.map((task, index) => {
      const hours = (task.intervalMinutes / 60).toFixed(1);
      return `${index + 1}. [${task.title}] - Lặp lại mỗi ${task.intervalMinutes}m (${hours}h)`;
    });
    lines.push(`---`);
    lines.push(`Dùng lệnh: ${ctx.prefix}de-ml <số> để hủy (Ví dụ: ${ctx.prefix}de-ml 1)`);
    return ctx.reply("DANH SÁCH MỆNH LỆNH ĐÃ GHI NHỚ", lines);
  }

  const index = Number.parseInt(rawArg, 10);
  if (Number.isNaN(index) || index < 1 || index > tasks.length) {
    return ctx.reply("LỖI CÚ PHÁP", [`Số thứ tự "${rawArg}" không hợp lệ. Vui lòng chọn từ 1 đến ${tasks.length}.`, `Xem danh sách: ${ctx.prefix}de-ml`]);
  }

  const deleted = await ctx.scheduler.deleteTaskByIndex(ctx.threadId, index);
  if (deleted) {
    return ctx.reply("ĐÃ HỦY MỆNH LỆNH", [`Đã hủy thành công mệnh lệnh số ${index}: "${deleted.title}"`]);
  }

  return ctx.reply("LỖI HỦY MỆNH LỆNH", ["Không thể xóa mệnh lệnh được chọn."]);
}
