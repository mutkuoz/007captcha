import type { MazeDefinition } from '../types';

interface Node {
  row: number;
  col: number;
  parent: Node | null;
}

export function solveMaze(maze: MazeDefinition): { row: number; col: number }[] | null {
  const { rows, cols, cells, entrance, exit } = maze;
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));

  const queue: Node[] = [{ row: entrance.row, col: entrance.col, parent: null }];
  visited[entrance.row][entrance.col] = true;

  const directions = [
    { dr: -1, dc: 0, wall: 'top' as const },
    { dr: 0, dc: 1, wall: 'right' as const },
    { dr: 1, dc: 0, wall: 'bottom' as const },
    { dr: 0, dc: -1, wall: 'left' as const },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.row === exit.row && current.col === exit.col) {
      const path: { row: number; col: number }[] = [];
      let node: Node | null = current;
      while (node) { path.unshift({ row: node.row, col: node.col }); node = node.parent; }
      return path;
    }

    for (const dir of directions) {
      if (cells[current.row][current.col].walls[dir.wall]) continue;
      const nr = current.row + dir.dr;
      const nc = current.col + dir.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited[nr][nc]) continue;
      visited[nr][nc] = true;
      queue.push({ row: nr, col: nc, parent: current });
    }
  }

  return null;
}
