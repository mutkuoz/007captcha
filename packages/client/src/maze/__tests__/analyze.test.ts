import { describe, it, expect } from 'vitest';
import { analyzeMazePath } from '../analyze';
import { generateMaze } from '../generate';
import { solveMaze } from '../solve';
import type { CapturePoint } from '../../types';

function pathToPoints(
  path: { row: number; col: number }[],
  maze: { cellSize: number },
  offsetX: number,
  offsetY: number,
  jitter = 0,
): CapturePoint[] {
  const points: CapturePoint[] = [];
  let t = 0;
  for (const cell of path) {
    const x = offsetX + cell.col * maze.cellSize + maze.cellSize / 2 + (Math.random() - 0.5) * jitter;
    const y = offsetY + cell.row * maze.cellSize + maze.cellSize / 2 + (Math.random() - 0.5) * jitter;
    points.push({ x, y, t });
    t += 16 + Math.random() * 10; // ~60fps with some variation
  }
  return points;
}

describe('analyzeMazePath', () => {
  it('should detect a valid path following the solution', () => {
    const maze = generateMaze(10, 12, 20);
    const solution = solveMaze(maze)!;
    const offsetX = 10;
    const offsetY = 10;
    const points = pathToPoints(solution, maze, offsetX, offsetY, 2);

    const result = analyzeMazePath(points, maze, solution, offsetX, offsetY);
    expect(result.reachedExit).toBe(true);
    expect(result.wallCrossings).toBe(0);
  });

  it('should detect wall crossings for a straight-line bot path', () => {
    const maze = generateMaze(10, 12, 20);
    const solution = solveMaze(maze)!;
    const offsetX = 10;
    const offsetY = 10;

    // Straight line from entrance to exit (ignoring maze walls)
    const startX = offsetX + maze.entrance.col * maze.cellSize + maze.cellSize / 2;
    const startY = offsetY + maze.entrance.row * maze.cellSize + maze.cellSize / 2;
    const endX = offsetX + maze.exit.col * maze.cellSize + maze.cellSize / 2;
    const endY = offsetY + maze.exit.row * maze.cellSize + maze.cellSize / 2;

    const botPoints: CapturePoint[] = [];
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      botPoints.push({
        x: startX + (endX - startX) * frac,
        y: startY + (endY - startY) * frac,
        t: i * 16,
      });
    }

    const result = analyzeMazePath(botPoints, maze, solution, offsetX, offsetY);
    // A straight line through a maze should cross many walls
    expect(result.wallCrossings).toBeGreaterThan(0);
    // Path straightness should be high (close to 1)
    expect(result.pathStraightness).toBeGreaterThan(0.8);
  });
});
