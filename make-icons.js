// make-icons.js — 生成 PWA 图标（纯 Node，无依赖）
// 运行: node make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, size, draw) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      // 先画到底色，再按 alpha 混合（简化：直接把带alpha的颜色画在默认白底上）
      const bg = [255, 255, 255];
      const bl = a / 255;
      raw[i] = Math.round(r * bl + bg[0] * (1 - bl));
      raw[i + 1] = Math.round(g * bl + bg[1] * (1 - bl));
      raw[i + 2] = Math.round(b * bl + bg[2] * (1 - bl));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log(`✓ ${path.basename(file)} ${size}x${size}`);
}

// 绘制：圆角深蓝底 + 白色圆角对话框 + 中央"开"字三笔（笔画）
function drawBase(x, y, s) {
  // 圆角矩形背景
  const r = s * 0.22;
  const cx = x + 0.5, cy = y + 0.5;
  const inX = cx >= r && cx <= s - r, inY = cy >= r && cy <= s - r;
  const corner = (px, py) => (px < r && py < r) ? (px - r) ** 2 + (py - r) ** 2 <= r * r
    : (px > s - r && py < r) ? (px - (s - r)) ** 2 + (py - r) ** 2 <= r * r
    : (px < r && py > s - r) ? (px - r) ** 2 + (py - (s - r)) ** 2 <= r * r
    : (px > s - r && py > s - r) ? (px - (s - r)) ** 2 + (py - (s - r)) ** 2 <= r * r : true;
  if (inX) return [16, 92, 168, 255];
  if (corner(cx, cy)) return [16, 92, 168, 255];
  return [255, 255, 255, 255];
}
function drawSpeech(x, y, s) {
  // 白色圆角对话框（上部），底部小三角
  const box = { x: s * 0.18, y: s * 0.3, w: s * 0.64, h: s * 0.32, r: s * 0.08 };
  const cx = x + 0.5, cy = y + 0.5;
  const inBox = cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  if (!inBox) return null;
  const corner = (px, py, bx, by, r) => (px < bx + r && py < by + r) && ((px - (bx + r)) ** 2 + (py - (by + r)) ** 2 > r * r) ? false
    : (px > bx + box.w - r && py < by + r) && ((px - (bx + box.w - r)) ** 2 + (py - (by + r)) ** 2 > r * r) ? false
    : (px < bx + r && py > by + box.h - r) && ((px - (bx + r)) ** 2 + (py - (by + box.h - r)) ** 2 > r * r) ? false
    : (px > bx + box.w - r && py > by + box.h - r) && ((px - (bx + box.w - r)) ** 2 + (py - (by + box.h - r)) ** 2 > r * r) ? false : true;
  if (!corner(cx, cy, box.x, box.y, box.r)) return null;
  // 尾巴三角
  if (cx >= box.x + box.w * 0.32 && cx <= box.x + box.w * 0.5 && cy > box.y + box.h && cy <= box.y + box.h + s * 0.09) {
    const t = (cy - (box.y + box.h)) / (s * 0.09);
    const wHalf = s * 0.09 * (1 - t);
    if (Math.abs(cx - (box.x + box.w * 0.41)) <= wHalf) return [255, 255, 255, 255];
  }
  return [255, 255, 255, 255];
}
function drawHammer(x, y, s) {
  // 中央深蓝"开"字三横一竖（简化：两横一竖像"开"）
  const cx = x + 0.5, cy = y + 0.5;
  const stroke = s * 0.045;
  // 三横
  const rows = [
    { y: s * 0.40, len: s * 0.42 },
    { y: s * 0.50, len: s * 0.30 },
    { y: s * 0.60, len: s * 0.42 },
  ];
  for (const row of rows) {
    const x0 = (s - row.len) / 2, x1 = (s + row.len) / 2;
    if (cx >= x0 && cx <= x1 && cy >= row.y - stroke / 2 && cy <= row.y + stroke / 2) return [22, 130, 210, 255];
  }
  // 中间竖
  if (cx >= s * 0.5 - stroke / 2 && cx <= s * 0.5 + stroke / 2 && cy >= s * 0.40 && cy <= s * 0.60) return [22, 130, 210, 255];
  return null;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writePng(path.join(OUT, name), size, (x, y, s) => {
    const bg = drawBase(x, y, s);
    const sp = drawSpeech(x, y, s);
    if (bg[0] === 255 && bg[1] === 255 && bg[2] === 255) return [255, 255, 255, 255];
    if (sp) {
      const hm = drawHammer(x, y, s);
      return hm || sp;
    }
    return bg;
  });
}
console.log('图标完成 ✓');
