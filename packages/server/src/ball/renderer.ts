import { deflateSync } from 'zlib';
import type { BallShape } from '../types';

// Render at half resolution — client scales to 480x400
const RENDER_W = 240;
const RENDER_H = 200;
const BALL_RADIUS = 10; // half of display radius (20px at full res)

// ── CRC32 for PNG chunks ──

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG encoding ──

function uint32BE(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n, 0);
  return buf;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  return Buffer.concat([uint32BE(data.length), typeAndData, uint32BE(crc32(typeAndData))]);
}

export function encodePNG(width: number, height: number, pixels: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  // bytes 10-12 are 0 (compression, filter, interlace)

  // Scanlines: filter byte (0=None) + RGB per row
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    raw[off] = 0; // filter: None
    const srcOff = y * width * 3;
    for (let i = 0; i < width * 3; i++) {
      raw[off + 1 + i] = pixels[srcOff + i];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 1 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel drawing ──

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function setPixel(
  px: Uint8Array, w: number, h: number,
  x: number, y: number,
  r: number, g: number, b: number, a: number,
): void {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const i = (y * w + x) * 3;
  px[i]     = Math.round(px[i]     * (1 - a) + r * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
}

function drawFilledCircle(
  px: Uint8Array, w: number, h: number,
  cx: number, cy: number, radius: number,
  r: number, g: number, b: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius + 1));
  for (let py = y0; py <= y1; py++) {
    for (let ppx = x0; ppx <= x1; ppx++) {
      const d = Math.sqrt((ppx - cx) ** 2 + (py - cy) ** 2);
      if (d <= radius - 0.5) {
        setPixel(px, w, h, ppx, py, r, g, b, 1);
      } else if (d <= radius + 0.5) {
        setPixel(px, w, h, ppx, py, r, g, b, radius + 0.5 - d);
      }
    }
  }
}

function drawFilledRect(
  px: Uint8Array, w: number, h: number,
  cx: number, cy: number, half: number,
  r: number, g: number, b: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(w - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(h - 1, Math.ceil(cy + half));
  for (let py = y0; py <= y1; py++) {
    for (let ppx = x0; ppx <= x1; ppx++) {
      setPixel(px, w, h, ppx, py, r, g, b, 1);
    }
  }
}

function drawFilledDiamond(
  px: Uint8Array, w: number, h: number,
  cx: number, cy: number, radius: number,
  r: number, g: number, b: number,
): void {
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  for (let py = y0; py <= y1; py++) {
    const hw = (1 - Math.abs(py - cy) / radius) * radius;
    const x0 = Math.max(0, Math.floor(cx - hw));
    const x1 = Math.min(w - 1, Math.ceil(cx + hw));
    for (let ppx = x0; ppx <= x1; ppx++) {
      setPixel(px, w, h, ppx, py, r, g, b, 1);
    }
  }
}

function drawFilledTriangle(
  px: Uint8Array, w: number, h: number,
  cx: number, cy: number, radius: number,
  r: number, g: number, b: number,
): void {
  const topY = cy - radius;
  const botY = cy + radius * 0.5;
  const halfBase = radius * Math.sqrt(3) / 2;
  const y0 = Math.max(0, Math.floor(topY));
  const y1 = Math.min(h - 1, Math.ceil(botY));
  for (let py = y0; py <= y1; py++) {
    const t = (py - topY) / (botY - topY);
    const hw = t * halfBase;
    const x0 = Math.max(0, Math.floor(cx - hw));
    const x1 = Math.min(w - 1, Math.ceil(cx + hw));
    for (let ppx = x0; ppx <= x1; ppx++) {
      setPixel(px, w, h, ppx, py, r, g, b, 1);
    }
  }
}

function drawShape(
  px: Uint8Array, w: number, h: number,
  cx: number, cy: number, radius: number,
  shape: BallShape, r: number, g: number, b: number,
): void {
  switch (shape) {
    case 'circle':   drawFilledCircle(px, w, h, cx, cy, radius, r, g, b); break;
    case 'square':   drawFilledRect(px, w, h, cx, cy, radius, r, g, b); break;
    case 'diamond':  drawFilledDiamond(px, w, h, cx, cy, radius, r, g, b); break;
    case 'triangle': drawFilledTriangle(px, w, h, cx, cy, radius, r, g, b); break;
  }
}

// ── Public API ──

/**
 * Render a ball frame to a PNG buffer at half resolution (200x170).
 * The client scales to full canvas size (400x340).
 * No external dependencies — uses only Node.js built-in zlib.
 */
export function renderBallFrame(
  ballX: number,
  ballY: number,
  bgColor: string,
  ballColor: string,
  ballShape: BallShape,
): Buffer {
  const pixels = new Uint8Array(RENDER_W * RENDER_H * 3);
  const [bgR, bgG, bgB] = parseHex(bgColor);
  const [bR, bG, bB] = parseHex(ballColor);

  // Fill background
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = bgR; pixels[i + 1] = bgG; pixels[i + 2] = bgB;
  }

  // Scale coordinates to render resolution
  const rx = ballX * (RENDER_W / 480);
  const ry = ballY * (RENDER_H / 400);

  // Shadow (offset, darker)
  const sR = Math.max(0, bgR - 40);
  const sG = Math.max(0, bgG - 40);
  const sB = Math.max(0, bgB - 40);
  drawShape(pixels, RENDER_W, RENDER_H, rx + 1, ry + 1, BALL_RADIUS, ballShape, sR, sG, sB);

  // Ball
  drawShape(pixels, RENDER_W, RENDER_H, rx, ry, BALL_RADIUS, ballShape, bR, bG, bB);

  return encodePNG(RENDER_W, RENDER_H, pixels);
}
