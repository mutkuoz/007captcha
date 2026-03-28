import type { CapturePoint } from './types';

export class DrawingCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: CapturePoint[] = [];
  private drawing = false;
  private strokeColor: string;
  private lineWidth: number;

  constructor(canvas: HTMLCanvasElement, strokeColor = '#333333', lineWidth = 3) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.strokeColor = strokeColor;
    this.lineWidth = lineWidth;
    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);
  }

  enable(): void {
    this.canvas.addEventListener('pointerdown', this.handleDown);
    this.canvas.addEventListener('pointermove', this.handleMove);
    this.canvas.addEventListener('pointerup', this.handleUp);
    this.canvas.addEventListener('pointerleave', this.handleUp);
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'crosshair';
  }

  disable(): void {
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointerleave', this.handleUp);
    this.drawing = false;
    this.canvas.style.cursor = 'default';
  }

  reset(): void {
    this.points = [];
    this.drawing = false;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
  }

  getPoints(): CapturePoint[] {
    return this.points;
  }

  isDrawing(): boolean {
    return this.drawing;
  }

  hasPoints(): boolean {
    return this.points.length > 0;
  }

  private getCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handleDown(e: PointerEvent): void {
    this.drawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.getCoords(e);
    const point: CapturePoint = { x, y, t: performance.now(), pressure: e.pressure };
    this.points.push(point);

    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  private handleMove(e: PointerEvent): void {
    if (!this.drawing) return;
    const { x, y } = this.getCoords(e);
    const point: CapturePoint = { x, y, t: performance.now(), pressure: e.pressure };
    this.points.push(point);

    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  private handleUp(_e: PointerEvent): void {
    this.drawing = false;
  }
}
