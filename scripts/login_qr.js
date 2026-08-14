import { Zalo } from "zca-js";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  console.log("=========================================");
  console.log("   SANGDEV ZALO BOT - ĐĂNG NHẬP MÃ QR");
  console.log("=========================================");
  console.log("Đang tạo mã QR đăng nhập Zalo...");

  const zalo = new Zalo({}, { selfListen: false, checkUpdate: false, logging: false });
  const qrFilePath = path.join(process.cwd(), "qr.png");

  try {
    const result = await zalo.loginQR({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      qrPath: qrFilePath
    }, (event) => {
      if (event.type === 0) { // QRCodeGenerated
        event.actions.saveToFile(qrFilePath);
        console.log(`\n[✓] Đã tạo mã QR thành công!`);
        console.log(`[➜] File mã QR: ${qrFilePath}`);
        console.log(`[➜] Hãy mở Zalo trên điện thoại -> Quét mã QR để đăng nhập.`);
      } else if (event.type === 1) { // QRCodeExpired
        console.log("\n[!] Mã QR đã hết hạn, đang tự động tạo mã mới...");
      } else if (event.type === 2) { // QRCodeScanned
        console.log(`\n[✓] Đã quét mã QR (${event.data?.display_name || "Người dùng"})! Vui lòng bấm Xác nhận trên điện thoại...`);
      } else if (event.type === 3) { // QRCodeDeclined
        console.log("\n[x] Đăng nhập bị từ chối trên điện thoại.");
      }
    });

    if (result && result.cookies) {
      console.log("\n=========================================");
      console.log(`[✓] ĐĂNG NHẬP THÀNH CÔNG: ${result.userInfo?.name || "Zalo User"} (${result.userInfo?.userId || ""})`);
      console.log("=========================================");

      // Đọc config hiện tại và cập nhật
      const configPath = path.join(process.cwd(), "config.json");
      let currentConfig = {};
      try {
        currentConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
      } catch {}

      currentConfig.cookie = result.cookies;
      currentConfig.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
      currentConfig.ownerId = currentConfig.ownerId || String(result.userInfo?.userId || "");
      currentConfig.prefix = currentConfig.prefix || "'";


      await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 2), "utf8");
      console.log("[✓] Đã tự động cập nhật Cookie mới vào file config.json!");
      console.log("[✓] Bây giờ bot có thể chạy và Online 100%!");
      await fs.unlink(qrFilePath).catch(() => {});
    }
  } catch (err) {
    console.error("\n[x] Lỗi đăng nhập QR:", err.message || err);
  }
}

main();
