const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generatePng(width, height, isMaskable = false) {
  const bytesPerPixel = 4; // RGBA
  const rawData = Buffer.alloc(height * (1 + width * bytesPerPixel));

  const cx = width / 2;
  const cy = height / 2;
  const outerR = (Math.min(width, height) / 2) * (isMaskable ? 0.78 : 0.88);
  const innerR = outerR * 0.82;
  const hubR = outerR * 0.18;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default background: Dark metallic graphite (#121212)
      let r = 18;
      let g = 18;
      let b = 18;
      let a = 255;

      if (dist <= outerR && dist >= innerR) {
        // Outer Harley-Davidson orange ring (#ff6600)
        r = 255;
        g = 102;
        b = 0;
      } else if (dist < innerR && dist > hubR) {
        // Dial Face: dark radial gradient (#1a1a1a to #0d0d0d)
        const dialRatio = dist / innerR;
        r = Math.floor(28 - dialRatio * 15);
        g = Math.floor(28 - dialRatio * 15);
        b = Math.floor(32 - dialRatio * 15);

        // Needle (pointing up-right ~45 deg / 3000 RPM)
        const angle = Math.atan2(dy, dx); // radians
        // Needle at approx -45 deg (-0.785 rad)
        const targetAngle = -0.785;
        let angleDiff = Math.abs(angle - targetAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        if (angleDiff < 0.08 && dist < innerR * 0.85) {
          // Orange needle
          r = 255;
          g = 80;
          b = 0;
        }

        // Speedometer tick marks around top arc
        if (dist > innerR * 0.75 && dist < innerR * 0.92) {
          const modAngle = Math.abs((angle + Math.PI) % 0.35);
          if (modAngle < 0.03) {
            r = 240;
            g = 240;
            b = 240;
          }
        }
      } else if (dist <= hubR) {
        // Center hub cap: chrome/silver (#d4d4d8) with orange center
        if (dist < hubR * 0.5) {
          r = 255;
          g = 102;
          b = 0;
        } else {
          r = 180;
          g = 180;
          b = 185;
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));

console.log('PWA PNG icons generated successfully!');
