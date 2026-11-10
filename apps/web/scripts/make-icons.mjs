// Generates the PWA icons (PNG) with no dependencies: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const teal = [13, 148, 136], white = [255, 255, 255];
  const radius = maskable ? 0 : size * 0.22; // maskable icons are full-bleed
  const s = size / 512;
  // tooth silhouette = union of two crown circles + a root-ish rounded body (in 512 space)
  const inTooth = (x, y) => {
    x /= s; y /= s;
    const circ = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    if (circ(210, 205, 78) || circ(302, 205, 78)) return true;
    if (x >= 150 && x <= 362 && y >= 205 && y <= 300) return true;
    // two roots tapering
    for (const cx of [210, 302]) {
      const t = (y - 300) / 120; // 0..1 down the root
      if (t >= 0 && t <= 1 && Math.abs(x - cx) <= 38 * (1 - 0.65 * t)) return true;
    }
    return false;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // rounded-square coverage
    const dx = Math.max(radius - x, 0, x - (size - 1 - radius)), dy = Math.max(radius - y, 0, y - (size - 1 - radius));
    const inside = dx * dx + dy * dy <= radius * radius;
    if (!inside) { px[i + 3] = 0; continue; }
    const c = inTooth(x, y) ? white : teal;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/', import.meta.url);
fs.writeFileSync(new URL('icon-192.png', out), png(192, false));
fs.writeFileSync(new URL('icon-512.png', out), png(512, false));
fs.writeFileSync(new URL('icon-maskable-512.png', out), png(512, true));
fs.writeFileSync(new URL('apple-touch-icon.png', out), png(180, true));
console.log('icons written');
