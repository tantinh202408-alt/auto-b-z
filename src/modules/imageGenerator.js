import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const escapeXml = (value) => String(value ?? "").replace(/[<>&'\"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" })[c]);

function wrap(text, max = 40) {
  return String(text).split(/\s+/).reduce((lines, word) => {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
    return lines;
  }, []);
}

function themeFor(title, requested) {
  if (requested && requested !== "#38bdf8") return { accent: requested, second: "#818cf8", glow: requested };
  if (/warning|cảnh báo|từ chối|lỗi/i.test(title)) return { accent: "#fb7185", second: "#f97316", glow: "#e11d48" };
  if (/admin|bật|mở|thành công/i.test(title)) return { accent: "#34d399", second: "#22d3ee", glow: "#059669" };
  return { accent: "#67e8f9", second: "#818cf8", glow: "#2563eb" };
}

function buildItems(lines, wrapLength = 40) {
  const items = [];
  for (const raw of lines) {
    const text = String(raw).trim();
    if (!text) continue;
    const section = /^[A-ZÀ-Ỹ\s]{3,}$/.test(text) && !text.startsWith("'");
    if (section) items.push({ type: "section", text });
    else wrap(text, wrapLength).forEach((part, index) => items.push({ type: index ? "continuation" : "line", text: part }));
  }
  return items;
}

export class ImageGenerator {
  constructor(root) { this.dir = path.join(root, "tmp"); }

  async render({ title, subtitle = "SANGDEV BOT", lines = [], accent = "#38bdf8", avatar = null }) {
    await fs.mkdir(this.dir, { recursive: true });
    const theme = themeFor(title, accent);
    const longestLine = Math.max(...lines.map((line) => String(line).length * 21), 0);
    const width = Math.min(1500, Math.max(900, String(title).length * 34 + 360, longestLine + 180));
    const wrapLength = Math.max(32, Math.floor((width - 260) / 21));
    const items = buildItems(lines, wrapLength);
    const contentHeight = items.reduce((sum, item) => sum + (item.type === "section" ? 82 : 68), 0);
    const height = Math.max(530, 450 + contentHeight);
    const avatarData = avatar ? `data:image/png;base64,${avatar.toString("base64")}` : "";
    let y = 330;
    const rows = items.map((item) => {
      if (item.type === "section") {
        const current = y; y += 82;
        return `<g><rect x="74" y="${current - 34}" width="8" height="40" rx="4" fill="url(#accent)"/><text x="102" y="${current - 3}" class="section">${escapeXml(item.text)}</text><line x1="102" y1="${current + 18}" x2="${width - 76}" y2="${current + 18}" stroke="#334155" stroke-opacity=".7"/></g>`;
      }
      const current = y; y += 68;
      const continuation = item.type === "continuation";
      return `<g><rect x="74" y="${current - 48}" width="${width - 148}" height="62" rx="19" fill="#ffffff" fill-opacity=".07" stroke="#ffffff" stroke-opacity=".10"/><circle cx="103" cy="${current - 17}" r="8" fill="${continuation ? "#64748b" : theme.accent}"/><text x="132" y="${current - 2}" class="item" fill="${continuation ? "#b3bfd3" : "#ffffff"}">${escapeXml(item.text)}</text></g>`;
    }).join("");
    const avatarSvg = avatarData
      ? `<circle cx="${width - 145}" cy="145" r="82" fill="url(#accent)"/><circle cx="${width - 145}" cy="145" r="76" fill="#0b1220"/><defs><clipPath id="avatarClip"><circle cx="${width - 145}" cy="145" r="69"/></clipPath></defs><image href="${avatarData}" x="${width - 214}" y="76" width="138" height="138" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/><circle cx="${width - 90}" cy="200" r="14" fill="#34d399" stroke="#07101e" stroke-width="5"/>`
      : `<circle cx="${width - 145}" cy="145" r="82" fill="url(#accent)"/><circle cx="${width - 145}" cy="145" r="74" fill="#0b1220"/><path d="M${width - 176} 137h62v42h-62z M${width - 164} 119h38v18h-38z" fill="none" stroke="#e2e8f0" stroke-width="6" stroke-linejoin="round"/><circle cx="${width - 159}" cy="157" r="5" fill="${theme.accent}"/><circle cx="${width - 131}" cy="157" r="5" fill="${theme.second}"/><path d="M${width - 159} 172h28" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round"/>`;

    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050816"/><stop offset=".52" stop-color="#0b1226"/><stop offset="1" stop-color="#101b35"/></linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.second}"/></linearGradient>
        <radialGradient id="orb"><stop stop-color="${theme.glow}" stop-opacity=".30"/><stop offset="1" stop-color="${theme.glow}" stop-opacity="0"/></radialGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity=".36"/></filter>
        <style>.brand{font:850 30px 'Segoe UI',Arial,sans-serif;letter-spacing:3px}.title{font:900 64px 'Segoe UI',Arial,sans-serif}.section{fill:#c4cee0;font:850 25px 'Segoe UI',Arial,sans-serif;letter-spacing:1.8px}.item{font:700 36px 'Segoe UI',Arial,sans-serif}.small{font:650 19px 'Segoe UI',Arial,sans-serif;letter-spacing:.5px}</style>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#background)"/>
      <circle cx="${width - 70}" cy="-10" r="390" fill="url(#orb)"/><circle cx="40" cy="${height}" r="350" fill="url(#orb)" opacity=".55"/>
      <g opacity=".12"><path d="M0 92h${width}M0 ${height - 110}h${width}" stroke="#fff"/><path d="M62 0v${height}M${width - 62} 0v${height}" stroke="#fff"/></g>
      <rect x="36" y="34" width="${width - 72}" height="${height - 68}" rx="34" fill="#0f172a" fill-opacity=".63" stroke="#ffffff" stroke-opacity=".11" filter="url(#shadow)"/>
      <rect x="36" y="34" width="10" height="${height - 68}" rx="5" fill="url(#accent)"/>
      <g transform="translate(74 68)"><rect width="54" height="54" rx="17" fill="url(#accent)"/><path d="M30 8L14 30h12l-3 16 16-24H27z" fill="#07101e"/><text x="74" y="37" class="brand" fill="#f8fafc">${escapeXml(subtitle)}</text></g>
      <text x="74" y="222" class="title" fill="#f8fafc">${escapeXml(title)}</text>
      <text x="76" y="258" class="small" fill="#74829b">ZALO COMMUNITY ASSISTANT</text>
      ${avatarSvg}${rows}
      <g transform="translate(74 ${height - 78})"><circle cx="7" cy="-6" r="7" fill="#34d399"/><text x="27" y="0" class="small" fill="#a7b3c8">ONLINE</text><text x="${width - 148}" y="0" text-anchor="end" class="small" fill="#74829b">SANGDEV.ONLINE</text></g>
    </svg>`;
    const file = path.join(this.dir, `reply-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
    return file;
  }

  async renderWelcome({ name, groupName = "CỘNG ĐỒNG SANGDEV", avatar = null }) {
    await fs.mkdir(this.dir, { recursive: true });
    const avatarData = avatar ? `data:image/png;base64,${avatar.toString("base64")}` : "";
    const rawName = String(name || "Thành viên mới").slice(0, 42);
    const rawGroup = String(groupName || "CỘNG ĐỒNG SANGDEV").slice(0, 52);
    const width = Math.min(1400, Math.max(940, rawName.length * 39 + 220, rawGroup.length * 21 + 260));
    const height = 820; const center = width / 2; const nameSize = Math.max(52, Math.min(76, 86 - Math.max(0, rawName.length - 16) * 1.45));
    const avatarSvg = avatarData
      ? `<defs><clipPath id="welcomeAvatar"><circle cx="${center}" cy="365" r="165"/></clipPath></defs><image href="${avatarData}" x="${center - 165}" y="200" width="330" height="330" clip-path="url(#welcomeAvatar)" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${center}" cy="365" r="165" fill="#171b3c"/><circle cx="${center}" cy="326" r="58" fill="#c4b5fd"/><path d="M${center - 118} 476c17-77 66-116 118-116s101 39 118 116" fill="#c4b5fd"/>`;
    const safeName = escapeXml(rawName); const safeGroup = escapeXml(rawGroup);
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="welcomeBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#11133f"/><stop offset=".48" stop-color="#312e81"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
        <linearGradient id="welcomeRing" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#67e8f9"/><stop offset=".5" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f9a8d4"/></linearGradient>
        <radialGradient id="welcomeGlow"><stop stop-color="#a78bfa" stop-opacity=".55"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
        <filter id="welcomeShadow"><feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#020617" flood-opacity=".5"/></filter>
        <style>.w{font-family:'Segoe UI',Arial,sans-serif}.caps{font-weight:800;letter-spacing:8px}.name{font-weight:900}.body{font-weight:650}</style>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#welcomeBg)"/><circle cx="${center}" cy="330" r="430" fill="url(#welcomeGlow)"/>
      <rect x="30" y="28" width="${width - 60}" height="764" rx="46" fill="#080b24" fill-opacity=".34" stroke="#fff" stroke-opacity=".18" filter="url(#welcomeShadow)"/>
      <text x="${center}" y="82" text-anchor="middle" class="w caps" fill="#a5f3fc" font-size="27">SANGDEV BOT</text>
      <text x="${center}" y="162" text-anchor="middle" class="w name" fill="#fff" font-size="76">WELCOME</text>
      <circle cx="${center}" cy="365" r="184" fill="url(#welcomeRing)"/><circle cx="${center}" cy="365" r="174" fill="#0b102e"/>${avatarSvg}
      <circle cx="${center + 124}" cy="489" r="28" fill="#34d399" stroke="#11133f" stroke-width="9"/>
      <text x="${center}" y="610" text-anchor="middle" class="w name" fill="#fff" font-size="${nameSize}">${safeName}</text>
      <text x="${center}" y="670" text-anchor="middle" class="w body" fill="#dbeafe" font-size="37">Chào mừng thành viên mới!</text>
      <rect x="${center - Math.min(400, width / 2 - 80)}" y="711" width="${Math.min(800, width - 160)}" height="64" rx="32" fill="#fff" fill-opacity=".11" stroke="#fff" stroke-opacity=".16"/>
      <text x="${center}" y="754" text-anchor="middle" class="w body" fill="#bae6fd" font-size="27">${safeGroup}</text>
    </svg>`;
    const file = path.join(this.dir, `welcome-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
    return file;
  }
}
