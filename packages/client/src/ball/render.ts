import type { BallFrame, BallShape, BallVisuals } from '../types';

const BALL_RADIUS = 20;
const CANVAS_W = 480;
const CANVAS_H = 400;

export function clearCanvas(ctx: CanvasRenderingContext2D, bgColor: string): void {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: BallShape,
  color: string,
  radius = BALL_RADIUS,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
      break;
    case 'triangle': {
      const h = radius * Math.sqrt(3);
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x - h / 2, y + radius / 2);
      ctx.lineTo(x + h / 2, y + radius / 2);
      ctx.closePath();
      break;
    }
    case 'diamond':
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.restore();
}

export function drawCountdown(
  ctx: CanvasRenderingContext2D,
  bgColor: string,
  ballColor: string,
  value: string,
): void {
  clearCanvas(ctx, bgColor);
  ctx.save();
  ctx.fillStyle = ballColor;
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, CANVAS_W / 2, CANVAS_H / 2);
  ctx.restore();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: BallFrame,
  visuals: BallVisuals,
): void {
  clearCanvas(ctx, visuals.bgColor);
  drawBall(ctx, frame.x, frame.y, visuals.ballShape, visuals.ballColor);
}
