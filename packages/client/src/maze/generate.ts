import type { MazeCell, MazeDefinition } from '../types';

interface Direction {
  dr: number;
  dc: number;
  wall: 'top' | 'right' | 'bottom' | 'left';
  opposite: 'top' | 'right' | 'bottom' | 'left';
}

const DIRECTIONS: Direction[] = [
  { dr: -1, dc: 0, wall: 'top', opposite: 'bottom' },
  { dr: 0, dc: 1, wall: 'right', opposite: 'left' },
  { dr: 1, dc: 0, wall: 'bottom', opposite: 'top' },
  { dr: 0, dc: -1, wall: 'left', opposite: 'right' },
];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a maze using iterative recursive backtracking (DFS).
 * @param rows Number of rows
 * @param cols Number of columns
 * @param cellSize Pixel size of each cell
 */
export function generateMaze(rows: number, cols: number, cellSize: number): MazeDefinition {
  // Initialize grid with all walls
  const cells: MazeCell[][] = [];
  for (let r = 0; r < rows; r++) {
    cells[r] = [];
    for (let c = 0; c < cols; c++) {
      cells[r][c] = {
        row: r,
        col: c,
        walls: { top: true, right: true, bottom: true, left: true },
      };
    }
  }

  // DFS with iterative stack
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack: [number, number][] = [];

  // Start from random cell
  const startR = Math.floor(Math.random() * rows);
  const startC = Math.floor(Math.random() * cols);
  visited[startR][startC] = true;
  stack.push([startR, startC]);

  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];
    const neighbors = shuffle([...DIRECTIONS]).filter(d => {
      const nr = cr + d.dr;
      const nc = cc + d.dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc];
    });

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const dir = neighbors[0];
    const nr = cr + dir.dr;
    const nc = cc + dir.dc;

    // Remove walls between current and neighbor
    cells[cr][cc].walls[dir.wall] = false;
    cells[nr][nc].walls[dir.opposite] = false;

    visited[nr][nc] = true;
    stack.push([nr, nc]);
  }

  // Place entrance on left edge, exit on right edge
  const entranceRow = Math.floor(Math.random() * rows);
  const exitRow = Math.floor(Math.random() * rows);

  // Open the entrance and exit walls
  cells[entranceRow][0].walls.left = false;
  cells[exitRow][cols - 1].walls.right = false;

  return {
    rows,
    cols,
    cells,
    entrance: { row: entranceRow, col: 0 },
    exit: { row: exitRow, col: cols - 1 },
    cellSize,
  };
}
