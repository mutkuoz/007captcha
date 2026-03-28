import { describe, it, expect } from 'vitest';
import { generateMaze } from '../generate';

describe('generateMaze', () => {
  it('should generate a maze with correct dimensions', () => {
    const maze = generateMaze(10, 12, 20);
    expect(maze.rows).toBe(10);
    expect(maze.cols).toBe(12);
    expect(maze.cells.length).toBe(10);
    expect(maze.cells[0].length).toBe(12);
    expect(maze.cellSize).toBe(20);
  });

  it('should have an entrance on the left and exit on the right', () => {
    const maze = generateMaze(10, 12, 20);
    expect(maze.entrance.col).toBe(0);
    expect(maze.exit.col).toBe(11);
    // Entrance left wall should be open
    expect(maze.cells[maze.entrance.row][0].walls.left).toBe(false);
    // Exit right wall should be open
    expect(maze.cells[maze.exit.row][11].walls.right).toBe(false);
  });

  it('should produce a connected maze (all cells reachable via BFS)', () => {
    const maze = generateMaze(8, 10, 20);
    const visited: boolean[][] = Array.from({ length: maze.rows }, () => new Array(maze.cols).fill(false));
    const queue: [number, number][] = [[0, 0]];
    visited[0][0] = true;
    let count = 0;

    const dirs = [
      { dr: -1, dc: 0, wall: 'top' as const },
      { dr: 0, dc: 1, wall: 'right' as const },
      { dr: 1, dc: 0, wall: 'bottom' as const },
      { dr: 0, dc: -1, wall: 'left' as const },
    ];

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      count++;
      for (const d of dirs) {
        if (maze.cells[r][c].walls[d.wall]) continue;
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (nr < 0 || nr >= maze.rows || nc < 0 || nc >= maze.cols) continue;
        if (visited[nr][nc]) continue;
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }

    expect(count).toBe(maze.rows * maze.cols);
  });
});
