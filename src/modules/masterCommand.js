import { fetchWeather } from "./weather.js";
import { parseDuration } from "./group.js";

const MASTER_TOOLS = [
  {
    name: "delete_message",
    description: "Xóa hoặc thu hồi tin nhắn trong nhóm (tin nhắn vừa gửi, tin nhắn được trích dẫn/reply, hoặc tin nhắn cụ thể)",
    parameters: {
      type: "OBJECT",
      properties: {
        target: { type: "STRING", description: "Loại tin nhắn cần xóa: 'quote' (tin nhắn được trích dẫn/reply) hoặc 'current' (tin nhắn hiện tại)" },
        reason: { type: "STRING", description: "Lý do xóa hoặc thu hồi" }
      }
    }
  },
  {
    name: "pin_message",
    description: "Ghim tin nhắn trong nhóm (tin nhắn đang trích dẫn hoặc tin nhắn văn bản thông báo)",
    parameters: {
      type: "OBJECT",
      properties: {
        messageText: { type: "STRING", description: "Nội dung cần thông báo và ghim nếu không có trích dẫn" }
      }
    }
  },
  {
    name: "unpin_message",
    description: "Bỏ ghim tin nhắn trong nhóm",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "tag_all_members",
    description: "Tag tất cả mọi người (@all / @mọi_người) trong nhóm kèm thông báo khẩn",
    parameters: {
      type: "OBJECT",
      properties: {
        content: { type: "STRING", description: "Nội dung thông báo cần gửi đến toàn bộ thành viên" }
      },
      required: ["content"]
    }
  },
  {
    name: "send_private_message",
    description: "Gửi tin nhắn riêng (inbox cá nhân) cho một thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userId: { type: "STRING", description: "UID của người nhận" },
        content: { type: "STRING", description: "Nội dung tin nhắn riêng cần gửi" }
      },
      required: ["userId", "content"]
    }
  },
  {
    name: "add_user_to_group",
    description: "Thêm thành viên (bằng UID hoặc số điện thoại) vào nhóm chat",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần thêm vào nhóm"
        }
      },
      required: ["userIds"]
    }
  },
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
    name: "warn_user",
    description: "Cảnh báo, phạt cảnh cáo thành viên vi phạm trong nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần cảnh báo"
        },
        reason: { type: "STRING", description: "Lý do cảnh báo" }
      },
      required: ["userIds"]
    }
  },
  {
    name: "reset_warnings",
    description: "Gỡ bỏ, xóa toàn bộ cảnh cáo vi phạm cho thành viên hoặc toàn bộ nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần xóa cảnh cáo (nếu trống sẽ xóa toàn nhóm)"
        },
        allGroup: { type: "BOOLEAN", description: "true để xóa cảnh cáo của tất cả thành viên trong nhóm" }
      }
    }
  },
  {
    name: "block_user",
    description: "Chặn và cấm vĩnh viễn (blacklist) thành viên khỏi nhóm chat",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần chặn/cấm"
        },
        reason: { type: "STRING", description: "Lý do chặn" }
      },
      required: ["userIds"]
    }
  },
  {
    name: "unblock_user",
    description: "Gỡ chặn (unblock / bỏ blacklist) cho thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần gỡ chặn"
        }
      },
      required: ["userIds"]
    }
  },
  {
    name: "whitelist_user",
    description: "Cấp hoặc hủy quyền miễn trừ kiểm tra (Whitelist) cho thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên"
        },
        enable: { type: "BOOLEAN", description: "true để thêm vào whitelist, false để hủy" }
      },
      required: ["userIds", "enable"]
    }
  },
  {
    name: "add_admin",
    description: "Thêm vai trò admin Bot cho thành viên",
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
    name: "remove_admin",
    description: "Xóa vai trò admin Bot (cắt admin) của thành viên",
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
    name: "add_group_deputy",
    description: "Bổ nhiệm thành viên làm Phó nhóm Zalo chính thức",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần bổ nhiệm phó nhóm"
        }
      },
      required: ["userIds"]
    }
  },
  {
    name: "remove_group_deputy",
    description: "Hủy vai trò Phó nhóm Zalo của thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userIds: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Danh sách UID thành viên cần tước quyền phó nhóm"
        }
      },
      required: ["userIds"]
    }
  },
  {
    name: "create_poll",
    description: "Tạo cuộc thăm dò ý kiến / bình chọn (Poll) trong nhóm Zalo",
    parameters: {
      type: "OBJECT",
      properties: {
        question: { type: "STRING", description: "Câu hỏi bình chọn" },
        options: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Các lựa chọn bình chọn (ví dụ: ['Đồng ý', 'Không đồng ý'])"
        }
      },
      required: ["question"]
    }
  },
  {
    name: "get_group_info",
    description: "Xem và tra cứu thông tin nhóm, danh sách admin, cấu hình bảo vệ hiện tại",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "get_user_info",
    description: "Xem hồ sơ cá nhân, số lần vi phạm, trạng thái blacklist của thành viên",
    parameters: {
      type: "OBJECT",
      properties: {
        userId: { type: "STRING", description: "UID của người cần kiểm tra" }
      },
      required: ["userId"]
    }
  },
  {
    name: "set_chat_lock",
    description: "Khóa hoặc mở quyền nhắn tin trong nhóm (có thể kèm thời gian hẹn giờ khóa ví dụ '2h', '30p', '1d', '2:00')",
    parameters: {
      type: "OBJECT",
      properties: {
        lock: { type: "BOOLEAN", description: "true để khóa chat, false để mở chat" },
        duration: { type: "STRING", description: "Thời gian khóa nếu có (ví dụ '30p', '2h', '1d', '2:00')" }
      },
      required: ["lock"]
    }
  },
  {
    name: "set_group_security",
    description: "Cấu hình bật/tắt các tính năng bảo vệ và chào mừng trong nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        antilink: { type: "BOOLEAN", description: "true để bật chống link, false để tắt" },
        antispam: { type: "BOOLEAN", description: "true để bật chống spam, false để tắt" },
        welcome: { type: "BOOLEAN", description: "true để bật chào mừng, false để tắt" },
        status: { type: "BOOLEAN", description: "true để bật bot hoạt động trong nhóm, false để tắt bot trong nhóm" }
      }
    }
  },
  {
    name: "set_advanced_group_settings",
    description: "Cài đặt nhóm nâng cao Zalo: Duyệt thành viên, xem lịch sử tin nhắn, tạo bình chọn, gửi sticker, gửi link",
    parameters: {
      type: "OBJECT",
      properties: {
        lockJoinGroup: { type: "BOOLEAN", description: "true để khóa/bật duyệt thành viên mới, false để tự do vào" },
        lockSeeMsgHistory: { type: "BOOLEAN", description: "true để không cho xem tin nhắn cũ, false để cho phép xem" },
        lockCreatePoll: { type: "BOOLEAN", description: "true để cấm thành viên tạo bình chọn, false để cho phép" },
        lockSendSticker: { type: "BOOLEAN", description: "true để cấm gửi sticker, false để cho phép" },
        lockSendLink: { type: "BOOLEAN", description: "true để cấm gửi link từ cài đặt nhóm Zalo, false để cho phép" }
      }
    }
  },
  {
    name: "send_repeated_message",
    description: "Gửi lặp lại tin nhắn nhiều lần (spam thông báo, nhắc nhở liên tục)",
    parameters: {
      type: "OBJECT",
      properties: {
        content: { type: "STRING", description: "Nội dung tin nhắn cần gửi" },
        count: { type: "NUMBER", description: "Số lượng tin nhắn cần gửi (tối đa 30)" }
      },
      required: ["content", "count"]
    }
  },
  {
    name: "send_railink",
    description: "Tạo lịch tự động rải tin nhắn định kỳ trong các nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        content: { type: "STRING", description: "Nội dung tin nhắn cần rải kèm thời hạn chu kỳ (ví dụ: 'Xin chào 3d 12h')" }
      },
      required: ["content"]
    }
  },
  {
    name: "stop_railink",
    description: "Hủy toàn bộ lịch rải tin nhắn tự động",
    parameters: {
      type: "OBJECT",
      properties: {}
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
    description: "Tạo mệnh lệnh tự động lặp lại theo thời gian (như báo thời tiết hằng ngày, gửi tin nhắc nhở định kỳ)",
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
    name: "delete_schedule_task",
    description: "Hủy mệnh lệnh tự động lặp lại đã ghi nhớ theo số thứ tự",
    parameters: {
      type: "OBJECT",
      properties: {
        taskIndex: { type: "NUMBER", description: "Số thứ tự của mệnh lệnh cần xóa (từ 1 trở đi)" }
      }
    }
  },
  {
    name: "change_group_name",
    description: "Đổi tên của nhóm chat",
    parameters: {
      type: "OBJECT",
      properties: {
        newName: { type: "STRING", description: "Tên mới của nhóm chat" }
      },
      required: ["newName"]
    }
  },
  {
    name: "render_custom_card",
    description: "Tạo và gửi một hình ảnh thiết kế đẹp (Card/Banner) với tiêu đề và nội dung tùy chỉnh",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Tiêu đề của ảnh card" },
        lines: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Các dòng nội dung hiển thị trong card ảnh"
        }
      },
      required: ["title", "lines"]
    }
  },
  {
    name: "leave_group",
    description: "Ra lệnh cho Bot tự động rời khỏi nhóm chat hiện tại (chỉ Owner)",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "set_gemini_api_key",
    description: "Cập nhật hoặc đổi API Key của AI Gemini (chỉ Owner)",
    parameters: {
      type: "OBJECT",
      properties: {
        apiKey: { type: "STRING", description: "Khóa Gemini API Key mới (ví dụ AIzaSy...)" }
      },
      required: ["apiKey"]
    }
  },
  {
    name: "play_zing_music",
    description: "Tìm kiếm và phát bài hát từ Zing MP3 gửi file âm thanh vào nhóm",
    parameters: {
      type: "OBJECT",
      properties: {
        songName: { type: "STRING", description: "Tên bài hát hoặc ca sĩ cần tìm và phát" }
      },
      required: ["songName"]
    }
  },
  {
    name: "system_bot_switch",
    description: "Bật hoặc tắt toàn bộ bot hệ thống (chỉ Owner)",
    parameters: {
      type: "OBJECT",
      properties: {
        enabled: { type: "BOOLEAN", description: "true để bật bot toàn hệ thống, false để tắt" }
      },
      required: ["enabled"]
    }
  }
];



export async function handleMasterCommand(ctx, body) {
  if (!ctx.isAdmin) return ctx.reply("TỪ CHỐI", ["Chỉ Admin hoặc Owner mới có quyền ra mệnh lệnh AI ('ml)."]);

  const commandText = body.trim();
  if (!commandText) {
    return ctx.reply("HƯỚNG DẪN MỆNH LỆNH AI MASTER ('ml)", [
      `Cú pháp: ${ctx.prefix}ml <mệnh lệnh yêu cầu bất kỳ>`,
      "Ví dụ toàn quyền quản trị:",
      `• ${ctx.prefix}ml xóa tin nhắn này / ghim tin nhắn này`,
      `• ${ctx.prefix}ml tag tất cả mọi người: Họp gấp nhé`,
      `• ${ctx.prefix}ml tạo bình chọn "Tối nay ăn gì?" với các món Phở, Cơm, Bún`,
      `• ${ctx.prefix}ml bổ nhiệm @Tên làm phó nhóm / xóa phó nhóm @Tên`,
      `• ${ctx.prefix}ml bật duyệt thành viên / tắt xem tin nhắn cũ`,
      `• ${ctx.prefix}ml nhắn riêng cho @Tên: Hãy giữ trật tự`,
      `• ${ctx.prefix}ml thêm @Tên vào nhóm / kích @Tên ra khỏi nhóm`,
      `• ${ctx.prefix}ml cấm @Tên vào nhóm / gỡ chặn @Tên`,
      `• ${ctx.prefix}ml cảnh cáo @Tên / xóa toàn bộ vi phạm trong nhóm`,
      `• ${ctx.prefix}ml thêm whitelist @Tên / hủy whitelist @Tên`,
      `• ${ctx.prefix}ml kiểm tra thông tin nhóm / thông tin @Tên`,
      `• ${ctx.prefix}ml khóa nhóm 2 giờ / mở nhóm chat`,
      `• ${ctx.prefix}ml bật chống link / bật chống spam / bật welcome`,
      `• ${ctx.prefix}ml spam Thông báo 5 lần / rải tin 3d 12h`,
      `• ${ctx.prefix}ml kiểm tra thời tiết Hà Nội hằng ngày`,
      `• ${ctx.prefix}ml đổi tên nhóm thành "Cộng Đồng Game"`,
      `---`,
      `Hủy mệnh lệnh đã ghi nhớ: ${ctx.prefix}de-ml`
    ]);
  }

  // Thu thập thông tin mentions và quote
  const mentions = ctx.message?.data?.mentions || [];
  const mentionDetails = mentions.map((m) => ({ uid: String(m.uid || ""), pos: m.pos, len: m.len }));
  const mentionUids = mentionDetails.map((m) => m.uid).filter(Boolean);
  const quoteMsg = ctx.message?.data?.quote;

  let contextInfo = `Nhóm ID: ${ctx.threadId}\nAdmin ra lệnh: ${ctx.senderId} (Owner: ${Boolean(ctx.isOwner)})`;
  if (mentionUids.length) {
    contextInfo += `\nThành viên được tag (@): ${mentionUids.join(", ")}`;
  }
  if (quoteMsg) {
    contextInfo += `\nĐang trích dẫn (quote) tin nhắn: ID=${quoteMsg.msgId || quoteMsg.cliMsgId}, Người gửi=${quoteMsg.uidFrom || ""}, Nội dung="${quoteMsg.content || ""}"`;
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

    // Fallback intent detection nếu AI không tạo functionCall rõ ràng
    const lowerText = commandText.toLowerCase();
    if (!functionCalls.length) {
      if (lowerText.includes("bình chọn") || lowerText.includes("poll") || lowerText.includes("thăm dò")) {
        functionCalls.push({ name: "create_poll", args: { question: commandText, options: ["Đồng ý", "Không đồng ý"] } });
      } else if (lowerText.includes("bổ nhiệm phó nhóm") || lowerText.includes("thêm phó nhóm")) {
        functionCalls.push({ name: "add_group_deputy", args: { userIds: mentionUids } });
      } else if (lowerText.includes("xóa phó nhóm") || lowerText.includes("hủy phó nhóm")) {
        functionCalls.push({ name: "remove_group_deputy", args: { userIds: mentionUids } });
      } else if (lowerText.includes("tag all") || lowerText.includes("tag mọi người") || lowerText.includes("tag tat ca") || lowerText.includes("kêu gọi mọi người")) {
        functionCalls.push({ name: "tag_all_members", args: { content: commandText } });
      } else if (lowerText.includes("ghim tin") || lowerText.includes("ghim")) {
        functionCalls.push({ name: "pin_message", args: { messageText: commandText } });
      } else if (lowerText.includes("bỏ ghim") || lowerText.includes("gỡ ghim")) {
        functionCalls.push({ name: "unpin_message", args: {} });
      } else if (lowerText.includes("xóa tin") || lowerText.includes("thu hồi") || lowerText.includes("xóa")) {
        functionCalls.push({ name: "delete_message", args: { target: quoteMsg ? "quote" : "current", reason: commandText } });
      } else if ((lowerText.includes("cắt admin") || lowerText.includes("xóa admin") || lowerText.includes("cut admin")) && mentionUids.length) {
        functionCalls.push({ name: "remove_admin", args: { userIds: mentionUids } });
      } else if ((lowerText.includes("thêm admin") || lowerText.includes("add admin")) && mentionUids.length) {
        functionCalls.push({ name: "add_admin", args: { userIds: mentionUids } });
      } else if (lowerText.includes("thêm vào whitelist") || lowerText.includes("cấp whitelist")) {
        functionCalls.push({ name: "whitelist_user", args: { userIds: mentionUids, enable: true } });
      } else if (lowerText.includes("hủy whitelist") || lowerText.includes("xóa whitelist")) {
        functionCalls.push({ name: "whitelist_user", args: { userIds: mentionUids, enable: false } });
      } else if (lowerText.includes("chặn") || lowerText.includes("cấm") || lowerText.includes("blacklist")) {
        functionCalls.push({ name: "block_user", args: { userIds: mentionUids, reason: commandText } });
      } else if (lowerText.includes("gỡ chặn") || lowerText.includes("bỏ chặn") || lowerText.includes("unblock")) {
        functionCalls.push({ name: "unblock_user", args: { userIds: mentionUids } });
      } else if (lowerText.includes("xóa toàn bộ vi phạm") || lowerText.includes("xóa hết cảnh cáo")) {
        functionCalls.push({ name: "reset_warnings", args: { allGroup: true } });
      } else if (lowerText.includes("gỡ cảnh cáo") || lowerText.includes("xóa phạt") || lowerText.includes("xóa cảnh cáo")) {
        functionCalls.push({ name: "reset_warnings", args: { userIds: mentionUids } });
      } else if (lowerText.includes("cảnh cáo") || lowerText.includes("cảnh báo") || lowerText.includes("phạt")) {
        functionCalls.push({ name: "warn_user", args: { userIds: mentionUids, reason: commandText } });
      } else if ((lowerText.includes("kích") || lowerText.includes("kick") || lowerText.includes("đá")) && mentionUids.length) {
        functionCalls.push({ name: "kick_user", args: { userIds: mentionUids, reason: commandText } });
      } else if (lowerText.includes("thông tin nhóm") || lowerText.includes("kiểm tra nhóm")) {
        functionCalls.push({ name: "get_group_info", args: {} });
      } else if ((lowerText.includes("thông tin") || lowerText.includes("kiểm tra")) && mentionUids.length) {
        functionCalls.push({ name: "get_user_info", args: { userId: mentionUids[0] } });
      } else if (lowerText.includes("khóa nhóm") || lowerText.includes("khóa chat") || lowerText.includes("đóng nhóm")) {
        const durMatch = commandText.match(/(\d+:\d+|\d+\s*[spmhd])/i);
        functionCalls.push({ name: "set_chat_lock", args: { lock: true, duration: durMatch?.[1] || "" } });
      } else if (lowerText.includes("mở nhóm") || lowerText.includes("mở chat")) {
        functionCalls.push({ name: "set_chat_lock", args: { lock: false } });
      } else if (lowerText.includes("chống link") || lowerText.includes("antilink")) {
        functionCalls.push({ name: "set_group_security", args: { antilink: !lowerText.includes("tắt") } });
      } else if (lowerText.includes("chống spam") || lowerText.includes("antispam")) {
        functionCalls.push({ name: "set_group_security", args: { antispam: !lowerText.includes("tắt") } });
      } else if (lowerText.includes("chào mừng") || lowerText.includes("welcome")) {
        functionCalls.push({ name: "set_group_security", args: { welcome: !lowerText.includes("tắt") } });
      } else if (lowerText.includes("duyệt thành viên")) {
        functionCalls.push({ name: "set_advanced_group_settings", args: { lockJoinGroup: !lowerText.includes("tắt") } });
      } else if (lowerText.includes("tin nhắn cũ")) {
        functionCalls.push({ name: "set_advanced_group_settings", args: { lockSeeMsgHistory: lowerText.includes("tắt") } });
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

      if (name === "delete_message") {
        if (quoteMsg) {
          const deleted = await ctx.safeDelete(quoteMsg);
          results.push(deleted ? "Đã xóa/thu hồi tin nhắn được trích dẫn thành công." : "Không thể xóa tin nhắn (cần quyền Phó nhóm cho bot).");
        } else {
          const deleted = await ctx.safeDelete(ctx.message);
          results.push(deleted ? "Đã xóa tin nhắn yêu cầu thành công." : "Không thể xóa tin nhắn.");
        }
      } else if (name === "pin_message") {
        const targetMsgId = quoteMsg?.msgId || ctx.message?.data?.msgId;
        if (targetMsgId) {
          const pinned = await ctx.pinMessage(ctx.threadId, targetMsgId);
          results.push(pinned ? "Đã ghim tin nhắn được chọn vào đầu nhóm." : "Đã gửi yêu cầu ghim tin nhắn.");
        } else if (args.messageText) {
          await ctx.replyText(`THÔNG BÁO GHIM:\n${args.messageText}`);
          results.push("Đã đăng thông báo ghim lên nhóm.");
        }
      } else if (name === "unpin_message") {
        const targetMsgId = quoteMsg?.msgId || ctx.message?.data?.msgId;
        if (targetMsgId) {
          await ctx.unpinMessage(ctx.threadId, targetMsgId);
          results.push("Đã bỏ ghim tin nhắn.");
        } else {
          results.push("Hãy trích dẫn (quote) tin nhắn cần bỏ ghim.");
        }
      } else if (name === "tag_all_members") {
        const msg = args.content || "Thông báo khẩn đến tất cả thành viên trong nhóm!";
        await ctx.tagAll(ctx.threadId, msg);
        results.push("Đã tag thông báo đến toàn bộ thành viên trong nhóm.");
      } else if (name === "send_private_message") {
        const targetId = args.userId || mentionUids[0];
        if (!targetId || !args.content) {
          results.push("Thiếu UID người nhận hoặc nội dung tin nhắn riêng.");
        } else {
          const sent = await ctx.sendPrivateMessage(targetId, args.content);
          results.push(sent ? `Đã gửi tin nhắn riêng đến UID: ${targetId}` : `Không thể gửi tin riêng cho UID: ${targetId}`);
        }
      } else if (name === "add_user_to_group") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID người cần thêm vào nhóm.");
        } else {
          await ctx.addUserToGroup(ctx.threadId, targetIds);
          results.push(`Đã gửi lời mời/thêm UID: ${targetIds.join(", ")} vào nhóm.`);
        }
      } else if (name === "add_group_deputy") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID người cần bổ nhiệm phó nhóm. Hãy tag @Tên.");
        } else {
          await ctx.addGroupDeputy(ctx.threadId, targetIds);
          results.push(`Đã bổ nhiệm Phó nhóm Zalo cho UID: ${targetIds.join(", ")}`);
        }
      } else if (name === "remove_group_deputy") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID người cần tước quyền phó nhóm. Hãy tag @Tên.");
        } else {
          await ctx.removeGroupDeputy(ctx.threadId, targetIds);
          results.push(`Đã tước quyền Phó nhóm Zalo của UID: ${targetIds.join(", ")}`);
        }
      } else if (name === "create_poll") {
        const q = String(args.question || "Bình chọn ý kiến").trim();
        const opts = Array.isArray(args.options) && args.options.length ? args.options : ["Đồng ý", "Không đồng ý"];
        await ctx.createPoll(ctx.threadId, q, opts);
        results.push(`Đã tạo cuộc bình chọn: "${q}" với ${opts.length} lựa chọn.`);
      } else if (name === "kick_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID thành viên cần kích. Hãy tag @Tên khi ra lệnh.");
        } else {
          for (const uid of targetIds) {
            await ctx.kick(ctx.threadId, uid);
            results.push(`Đã kích thành viên UID: ${uid} ra khỏi nhóm.`);
          }
        }
      } else if (name === "warn_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID thành viên cần cảnh báo. Hãy tag @Tên.");
        } else {
          for (const uid of targetIds) {
            const reason = args.reason || "Vi phạm quy định nhóm";
            const warnings = await ctx.store.increment(`warnings/${ctx.threadId}/${uid}/count`);
            await ctx.store.update(`warnings/${ctx.threadId}/${uid}`, { reason, lastAt: Date.now() });
            results.push(`Đã cảnh cáo UID: ${uid} (Vi phạm ${warnings}/10) - Lý do: ${reason}`);
            if (warnings >= 10) {
              await ctx.kick(ctx.threadId, uid);
              results.push(`Thành viên UID: ${uid} đã bị kích do vượt quá 10 lần vi phạm.`);
            }
          }
        }
      } else if (name === "reset_warnings") {
        if (args.allGroup) {
          await ctx.store.remove(`warnings/${ctx.threadId}`);
          results.push("Đã xóa sạch toàn bộ lịch sử vi phạm cho mọi thành viên trong nhóm.");
        } else {
          const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
          if (!targetIds.length) {
            await ctx.store.remove(`warnings/${ctx.threadId}`);
            results.push("Đã xóa sạch toàn bộ lịch sử vi phạm cho nhóm.");
          } else {
            for (const uid of targetIds) {
              await ctx.store.remove(`warnings/${ctx.threadId}/${uid}`);
              await ctx.store.update(`users/${uid}`, { warnings: 0 });
              results.push(`Đã xóa toàn bộ vi phạm và gỡ cảnh cáo cho UID: ${uid}`);
            }
          }
        }
      } else if (name === "block_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID thành viên cần chặn. Hãy tag @Tên.");
        } else {
          for (const uid of targetIds) {
            await ctx.store.update(`users/${uid}`, { blacklisted: true, blacklistedAt: Date.now(), reason: args.reason || "Bị cấm bởi AI Master" });
            await ctx.kick(ctx.threadId, uid);
            results.push(`Đã cấm vĩnh viễn và kích UID: ${uid} khỏi nhóm.`);
          }
        }
      } else if (name === "unblock_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        if (!targetIds.length) {
          results.push("Không tìm thấy UID thành viên cần gỡ chặn. Hãy tag @Tên.");
        } else {
          for (const uid of targetIds) {
            await ctx.store.update(`users/${uid}`, { blacklisted: false });
            results.push(`Đã gỡ chặn (unblock) cho UID: ${uid}`);
          }
        }
      } else if (name === "whitelist_user") {
        const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
        const enable = Boolean(args.enable);
        for (const uid of targetIds) {
          if (enable) await ctx.store.set(`permissions/whitelist/${uid}`, true);
          else await ctx.store.remove(`permissions/whitelist/${uid}`);
          results.push(enable ? `Đã thêm UID: ${uid} vào danh sách miễn trừ (Whitelist)` : `Đã gỡ UID: ${uid} khỏi danh sách Whitelist`);
        }
      } else if (name === "remove_admin") {
        if (!ctx.isOwner) {
          results.push("Chỉ Owner mới có quyền xóa vai trò admin.");
        } else {
          const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
          if (!targetIds.length) {
            results.push("Không tìm thấy UID thành viên cần xóa admin. Hãy tag @Tên.");
          } else {
            for (const uid of targetIds) {
              await ctx.store.remove(`admins/${uid}`);
              results.push(`Đã xóa vai trò admin của UID: ${uid}`);
            }
          }
        }
      } else if (name === "add_admin") {
        if (!ctx.isOwner) {
          results.push("Chỉ Owner mới có quyền thêm admin.");
        } else {
          const targetIds = Array.isArray(args.userIds) && args.userIds.length ? args.userIds : mentionUids;
          if (!targetIds.length) {
            results.push("Không tìm thấy UID thành viên cần thêm admin. Hãy tag @Tên.");
          } else {
            for (const uid of targetIds) {
              await ctx.store.set(`admins/${uid}`, { id: uid, name: `Admin_${uid}`, addedAt: Date.now(), addedBy: ctx.senderId });
              results.push(`Đã thêm vai trò admin cho UID: ${uid}`);
            }
          }
        }
      } else if (name === "get_group_info") {
        const group = await ctx.store.get(`groups/${ctx.threadId}`, {});
        const admins = await ctx.store.get("admins", {});
        results.push(`THÔNG TIN NHÓM (ID: ${ctx.threadId}):\n- Trạng thái Bot: ${group.status ? "Hoạt động" : "Tắt"}\n- Chống link: ${group.antilink ? "Bật" : "Tắt"}\n- Chống spam: ${group.antisp ? "Bật" : "Tắt"}\n- Chào mừng: ${group.welcome !== false ? "Bật" : "Tắt"}\n- Số lượng Admin hệ thống: ${Object.keys(admins).length}`);
      } else if (name === "get_user_info") {
        const targetId = args.userId || mentionUids[0] || ctx.senderId;
        const user = await ctx.store.get(`users/${targetId}`, {});
        const warnings = await ctx.store.get(`warnings/${ctx.threadId}/${targetId}`, {});
        results.push(`HỒ SƠ THÀNH VIÊN (UID: ${targetId}):\n- Tên: ${user.username || "Chưa lưu"}\n- Vi phạm trong nhóm: ${warnings.count || 0}/10 lần\n- Blacklist: ${user.blacklisted ? "Đang bị cấm" : "Bình thường"}\n- Hoạt động gần nhất: ${user.lastSeen ? new Date(user.lastSeen).toLocaleString("vi-VN") : "N/A"}`);
      } else if (name === "set_chat_lock") {
        const lock = Boolean(args.lock);
        if (lock && args.duration) {
          const ms = parseDuration(args.duration);
          if (ms) {
            const expire = Date.now() + ms;
            await ctx.store.update(`groups/${ctx.threadId}`, { chatEnabled: true, expire });
            ctx.scheduleGroupLock(expire);
            results.push(`Đã hẹn giờ: Nhóm sẽ khóa chat lúc ${new Date(expire).toLocaleString("vi-VN")}.`);
          } else {
            await ctx.setGroupChat(false);
            results.push("Đã khóa quyền nhắn tin trong nhóm.");
          }
        } else {
          await ctx.setGroupChat(!lock);
          results.push(lock ? "Đã khóa quyền nhắn tin trong nhóm." : "Đã mở lại quyền nhắn tin cho nhóm.");
        }
      } else if (name === "set_group_security") {
        const groupKey = `groups/${ctx.threadId}`;
        const updates = {};
        if (typeof args.antilink === "boolean") {
          updates.antilink = args.antilink;
          results.push(`Chống gửi link (Anti-Link): ${args.antilink ? "BẬT" : "TẮT"}`);
        }
        if (typeof args.antispam === "boolean") {
          updates.antispam = args.antispam;
          updates.antisp = args.antispam;
          results.push(`Chống Spam (Anti-Spam): ${args.antispam ? "BẬT" : "TẮT"}`);
        }
        if (typeof args.welcome === "boolean") {
          updates.welcome = args.welcome;
          results.push(`Chào mừng thành viên mới: ${args.welcome ? "BẬT" : "TẮT"}`);
        }
        if (typeof args.status === "boolean") {
          updates.status = args.status;
          results.push(`Bot hoạt động trong nhóm: ${args.status ? "BẬT" : "TẮT"}`);
        }
        if (Object.keys(updates).length) {
          await ctx.store.update(groupKey, updates);
        }
      } else if (name === "set_advanced_group_settings") {
        await ctx.setGroupSettingsAdvanced(ctx.threadId, args);
        results.push("Đã cập nhật cài đặt nhóm Zalo nâng cao thành công.");
      } else if (name === "send_repeated_message") {
        const content = String(args.content || "").trim();
        const count = Math.min(30, Math.max(1, Number(args.count) || 1));
        if (!content) {
          results.push("Nội dung tin nhắn lặp không được để trống.");
        } else {
          await ctx.sendRepeatedText(content, count);
          results.push(`Đã gửi lặp ${count} tin nhắn thành công.`);
        }
      } else if (name === "send_railink") {
        try {
          await ctx.railink.create(args.content, ctx.senderId);
          results.push("Đã bật và lập lịch rải tin nhắn tự động.");
        } catch (e) {
          results.push(`Lỗi thiết lập rải tin: ${e.message}`);
        }
      } else if (name === "stop_railink") {
        await ctx.railink.stop();
        results.push("Đã hủy toàn bộ lịch rải tin nhắn tự động.");
      } else if (name === "get_weather") {
        const loc = args.location || "Hà Nội";
        const weather = await fetchWeather(loc);
        results.push(weather.summary);
      } else if (name === "schedule_task") {
        if (!ctx.scheduler) {
          results.push("Hệ thống TaskScheduler chưa được khởi tạo.");
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
          results.push(`ĐÃ GHI NHỚ MỆNH LỆNH:\n- Tiêu đề: ${task.title}\n- Tần suất: Lặp lại mỗi ${task.intervalMinutes} phút (${(task.intervalMinutes / 60).toFixed(1)} giờ)\n- Hủy mệnh lệnh bằng: ${ctx.prefix}de-ml`);
        }
      } else if (name === "delete_schedule_task") {
        const index = Number(args.taskIndex);
        if (index >= 1) {
          const deleted = await ctx.scheduler.deleteTaskByIndex(ctx.threadId, index);
          results.push(deleted ? `Đã hủy mệnh lệnh số ${index}: "${deleted.title}"` : `Không tìm thấy mệnh lệnh số ${index}`);
        } else {
          results.push(`Vui lòng nhập số thứ tự mệnh lệnh cần xóa. Dùng lệnh: ${ctx.prefix}de-ml`);
        }
      } else if (name === "change_group_name") {
        const newName = String(args.newName || "").trim();
        if (newName) {
          try {
            if (typeof ctx.api?.changeGroupName === "function") {
              await ctx.api.changeGroupName(newName, ctx.threadId);
            }
            results.push(`Đã đổi tên nhóm thành: "${newName}"`);
          } catch (e) {
            results.push(`Không thể đổi tên nhóm: ${e.message}`);
          }
        }
      } else if (name === "render_custom_card") {
        const title = String(args.title || "THÔNG BÁO").trim();
        const lines = Array.isArray(args.lines) ? args.lines : [String(args.lines || "")];
        return ctx.reply(title, lines);
      } else if (name === "leave_group") {
        if (!ctx.isOwner) {
          results.push("Chỉ Owner mới có quyền ra lệnh bot rời nhóm.");
        } else {
          await ctx.leaveGroup(ctx.threadId);
          results.push("Bot đang rời khỏi nhóm theo lệnh của Owner.");
        }
      } else if (name === "set_gemini_api_key") {
        if (!ctx.isOwner) {
          results.push("Chỉ Owner mới có quyền đổi Gemini API Key.");
        } else {
          const newKey = String(args.apiKey || "").trim();
          if (!newKey) {
            results.push("Khóa API Key không được để trống.");
          } else {
            ctx.gemini.apiKey = newKey;
            await ctx.store.set("settings/geminiApiKey", newKey);
            const masked = `${newKey.slice(0, 8)}...${newKey.slice(-6)}`;
            results.push(`Đã cập nhật Gemini API Key mới: ${masked}`);
          }
        }
      } else if (name === "play_zing_music") {
        const songName = String(args.songName || "").trim();
        if (!songName) {
          results.push("Tên bài hát không được để trống.");
        } else if (!ctx.zing) {
          results.push("Dịch vụ Zing MP3 chưa được kích hoạt.");
        } else {
          try {
            const songs = await ctx.zing.searchSongs(songName);
            if (!songs.length) {
              results.push(`Không tìm thấy bài hát nào với từ khóa "${songName}" trên Zing MP3.`);
            } else {
              const song = songs[0];
              await ctx.replyText(`🎵 ĐANG PHÁT TỪ ZING MP3:\n• Tên bài: ${song.title}\n• Nghệ sĩ: ${song.artists}`);
              let voiceSent = false;
              const streamUrl = await ctx.zing.getStreamUrl(song.id);
              if (streamUrl && typeof ctx.api?.sendVoice === "function") {
                try {
                  await ctx.api.sendVoice({ voiceUrl: streamUrl, ttl: 0 }, String(ctx.threadId), Number(ctx.message.type));
                  voiceSent = true;
                } catch {}
              }
              if (!voiceSent) {
                const filePath = await ctx.zing.downloadSong(song.id);
                try {
                  await ctx.api.sendMessage({ msg: "", attachments: [filePath] }, String(ctx.threadId), Number(ctx.message.type));
                } finally {
                  const fsPromises = (await import("node:fs/promises")).default;
                  await fsPromises.unlink(filePath).catch(() => {});
                }
              }
              results.push(`Đã phát bài hát "${song.title} - ${song.artists}" thành công.`);

            }
          } catch (err) {
            results.push(`Không thể phát bài hát "${songName}": ${err.message}`);
          }
        }
      } else if (name === "system_bot_switch") {
        if (!ctx.isOwner) {
          results.push("Chỉ Owner mới có quyền Bật/Tắt toàn bộ bot hệ thống.");
        } else {

          const enabled = Boolean(args.enabled);
          await ctx.store.set("settings/botEnabled", enabled);
          results.push(`Hệ thống Bot đã được: ${enabled ? "BẬT TOÀN DIỆN" : "TẮT TẠM THỜI"}`);
        }
      }

    }

    if (aiResult.text && !results.length) {
      results.push(aiResult.text);
    }

    if (!results.length) {
      results.push("Đã tiếp nhận mệnh lệnh nhưng không tìm thấy hành động phù hợp. Hãy kiểm tra lại cú pháp.");
    }

    return ctx.reply("MỆNH LỆNH AI MASTER", results);
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
