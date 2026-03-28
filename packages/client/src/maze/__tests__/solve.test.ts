import { describe, it, expect } from 'vitest';
import { generateMaze } from '../generate';
import { solveMaze } from '../solve';

describe('solveMaze', () => {
  it('should find a solution for every generated maze', () => {
    // Run multiple times since mazes are random
    for (let i = 0; i < 20; i++) {
      const maze = generateMaze(10, 12, 20);
      const path = solveMaze(maze);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(1);
      // First cell is entrance
      expect(path![0].row).toBe(maze.entrance.row);
      expect(path![0].col).toBe(maze.entrance.col);
      // Last cell is exit
      expect(path![path!.length - 1].row).toBe(maze.exit.row);
      expect(path![path!.length - 1].col).toBe(maze.exit.col);
    }
  });

  it('should return shortest path (no detours)', () => {
    const maze = generateMaze(5, 5, 20);
    const path = solveMaze(maze);
    expect(path).not.toBeNull();

    // Each step should be adjacent (Manhattan distance = 1)
    for (let i = 1; i < path!.length; i++) {
      const dr = Math.abs(path![i].row - path![i - 1].row);
      const dc = Math.abs(path![i].col - path![i - 1].col);
      expect(dr + dc).toBe(1);
    }
  });
});
