import type { MazeDefinition } from '../types';
import { encodePNG } from '../ball/renderer';

const CANVAS_W = 480;
const CANVAS_H = 400;
const WALL_THICKNESS = 2;

// Pre-blended colors (over white background)
const BG_R = 255, BG_G = 255, BG_B = 255;
const WALL_R = 55, WALL_G = 65, WALL_B = 81;       // #374151
const ENTRANCE_R = 189, ENTRANCE_G = 238, ENTRANCE_B = 207; // rgba(34,197,94,0.3) over white
const EXIT_R = 250, EXIT_G = 199, EXIT_B = 199;     // rgba(239,68,68,0.3) over white

function fillRect(
  px: Uint8Array, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number,
  r: number, g: number, b: number,
): void {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(w - 1, Math.floor(x1));
  const iy1 = Math.min(h - 1, Math.floor(y1));
  for (let py = iy0; py <= iy1; py++) {
    for (let ppx = ix0; ppx <= ix1; ppx++) {
      const i = (py * w + ppx) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
}

export interface MazeRenderResult {
  image: Buffer;
  offsetX: number;
  offsetY: number;
}

/**
 * Render a maze to a PNG buffer at full resolution (480x400).
 */
export function renderMazeImage(maze: MazeDefinition): MazeRenderResult {
  const { rows, cols, cells, entrance, exit, cellSize } = maze;
  const totalW = cols * cellSize;
  const totalH = rows * cellSize;
  const offsetX = Math.floor((CANVAS_W - totalW) / 2);
  const offsetY = Math.floor((CANVAS_H - totalH) / 2);

  const pixels = new Uint8Array(CANVAS_W * CANVAS_H * 3);

  // Fill background white
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = BG_R; pixels[i + 1] = BG_G; pixels[i + 2] = BG_B;
  }

  // Entrance zone (light green)
  const entX0 = offsetX - cellSize * 0.5;
  const entY0 = offsetY + entrance.row * cellSize;
  fillRect(pixels, CANVAS_W, CANVAS_H, entX0, entY0, entX0 + cellSize * 0.5 - 1, entY0 + cellSize - 1,
    ENTRANCE_R, ENTRANCE_G, ENTRANCE_B);

  // Exit zone (light red)
  const exX0 = offsetX + totalW;
  const exY0 = offsetY + exit.row * cellSize;
  fillRect(pixels, CANVAS_W, CANVAS_H, exX0, exY0, exX0 + cellSize * 0.5 - 1, exY0 + cellSize - 1,
    EXIT_R, EXIT_G, EXIT_B);

  // Draw walls (axis-aligned 2px thick lines)
  const half = Math.floor(WALL_THICKNESS / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const w = cells[r][c].walls;

      if (w.top) {
        fillRect(pixels, CANVAS_W, CANVAS_H, x, y - half, x + cellSize, y + half, WALL_R, WALL_G, WALL_B);
      }
      if (w.right) {
        fillRect(pixels, CANVAS_W, CANVAS_H, x + cellSize - half, y, x + cellSize + half, y + cellSize, WALL_R, WALL_G, WALL_B);
      }
      if (w.bottom) {
        fillRect(pixels, CANVAS_W, CANVAS_H, x, y + cellSize - half, x + cellSize, y + cellSize + half, WALL_R, WALL_G, WALL_B);
      }
      if (w.left) {
        fillRect(pixels, CANVAS_W, CANVAS_H, x - half, y, x + half, y + cellSize, WALL_R, WALL_G, WALL_B);
      }
    }
  }

  return {
    image: encodePNG(CANVAS_W, CANVAS_H, pixels),
    offsetX,
    offsetY,
  };
}
