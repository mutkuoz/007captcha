import type { MazeDefinition } from '../types';

/**
 * Render a maze onto a canvas context.
 * Assumes ctx is already scaled for devicePixelRatio.
 */
export function renderMaze(
  ctx: CanvasRenderingContext2D,
  maze: MazeDefinition,
  wallColor: string,
  bgColor: string,
  entranceColor: string,
  exitColor: string,
): void {
  const { rows, cols, cells, entrance, exit, cellSize } = maze;
  const totalW = cols * cellSize;
  const totalH = rows * cellSize;

  // Offset to center the maze on the canvas
  const canvasW = ctx.canvas.width / (window.devicePixelRatio || 1);
  const canvasH = ctx.canvas.height / (window.devicePixelRatio || 1);
  const offsetX = Math.floor((canvasW - totalW) / 2);
  const offsetY = Math.floor((canvasH - totalH) / 2);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Entrance zone
  ctx.fillStyle = entranceColor;
  ctx.fillRect(
    offsetX - cellSize * 0.5,
    offsetY + entrance.row * cellSize,
    cellSize * 0.5,
    cellSize,
  );

  // Exit zone
  ctx.fillStyle = exitColor;
  ctx.fillRect(
    offsetX + totalW,
    offsetY + exit.row * cellSize,
    cellSize * 0.5,
    cellSize,
  );

  // Draw walls
  ctx.strokeStyle = wallColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      const w = cells[r][c].walls;

      if (w.top) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
        ctx.stroke();
      }
      if (w.right) {
        ctx.beginPath();
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
      if (w.bottom) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
      if (w.left) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellSize);
        ctx.stroke();
      }
    }
  }
}

/** Get the pixel offset used for rendering the maze on canvas */
export function getMazeOffset(
  ctx: CanvasRenderingContext2D,
  maze: MazeDefinition,
): { offsetX: number; offsetY: number } {
  const totalW = maze.cols * maze.cellSize;
  const totalH = maze.rows * maze.cellSize;
  const canvasW = ctx.canvas.width / (window.devicePixelRatio || 1);
  const canvasH = ctx.canvas.height / (window.devicePixelRatio || 1);
  return {
    offsetX: Math.floor((canvasW - totalW) / 2),
    offsetY: Math.floor((canvasH - totalH) / 2),
  };
}
