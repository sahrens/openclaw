// Baseline agent policy — pure code, no LLM calls
// Strategy per env type: pattern detection + simple heuristics

const strategies = {
  // Pattern fill: detect stripe pattern from revealed cells, fill blanks
  pattern_fill(obs, _mem) {
    const { grid, agentPos } = obs;
    const colors = new Set();
    for (const row of grid) {
      for (const c of row) {
        if (c !== 0) {
          colors.add(c);
        }
      }
    }
    const colorArr = [...colors].toSorted((a, b) => a - b);
    if (colorArr.length < 2) {
      return randomMove(obs);
    }

    const blank = findNearest(grid, agentPos, (c) => c === 0);
    if (!blank) {
      return "up";
    }

    const nav = navigateTo(agentPos, blank, obs.allowedActions);
    if (nav) {
      return nav;
    }

    return blank.y % 2 === 0 ? "paint1" : "paint2";
  },

  // Path find: BFS to target (color 3)
  path_find(obs, _mem) {
    const { grid, agentPos } = obs;
    let target = null;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] === 3) {
          target = { x, y };
        }
      }
    }
    if (!target) {
      return "up";
    }

    const path = bfs(grid, agentPos, target, (c) => c !== 9);
    if (path && path.length > 0) {
      return path[0];
    }
    return randomMove(obs);
  },

  // Color sort: simple insertion sort approach
  color_sort(obs, _mem) {
    const { grid, agentPos, inventory } = obs;
    const row = grid[0];

    if (inventory !== null) {
      const sorted = row
        .filter((c) => c !== 0)
        .concat(inventory)
        .toSorted((a, b) => a - b);
      const targetIdx = sorted.indexOf(inventory);
      const emptySlots = [];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === 0) {
          emptySlots.push(i);
        }
      }
      const best = emptySlots.reduce(
        (a, b) => (Math.abs(b - targetIdx) < Math.abs(a - targetIdx) ? b : a),
        emptySlots[0],
      );
      if (agentPos.x !== best) {
        return agentPos.x < best ? "right" : "left";
      }
      return "place";
    }

    const nonZero = row.filter((c) => c !== 0);
    if (nonZero.length === row.length && nonZero.every((v, i) => i === 0 || v >= nonZero[i - 1])) {
      return "left";
    }

    for (let i = 1; i < row.length; i++) {
      if (row[i] !== 0 && row[i - 1] !== 0 && row[i] < row[i - 1]) {
        if (agentPos.x !== i) {
          return agentPos.x < i ? "right" : "left";
        }
        return "pick";
      }
    }
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== 0) {
        if (agentPos.x !== i) {
          return agentPos.x < i ? "right" : "left";
        }
        return "pick";
      }
    }
    return "left";
  },

  // Mirror: copy left half to right half (mirrored)
  mirror(obs, _mem) {
    const { grid, agentPos, allowedActions } = obs;
    const w = grid[0].length,
      mid = Math.ceil(w / 2);

    for (let y = 0; y < grid.length; y++) {
      for (let x = mid; x < w; x++) {
        const mirrorX = w - 1 - x;
        if (grid[y][x] !== grid[y][mirrorX]) {
          const nav = navigateTo(agentPos, { x, y }, allowedActions);
          if (nav) {
            return nav;
          }
          const target = grid[y][mirrorX];
          const colorsUsed = new Set();
          for (const row of grid) {
            for (const c of row) {
              if (c !== 0) {
                colorsUsed.add(c);
              }
            }
          }
          const sorted = [...colorsUsed].toSorted((a, b) => a - b);
          const idx = sorted.indexOf(target);
          if (idx >= 0) {
            return `paint${idx + 1}`;
          }
          return "paint1";
        }
      }
    }
    return "up";
  },

  // Flood fill: navigate to each region cell and toggle
  flood_fill(obs, _mem) {
    const { grid, agentPos } = obs;
    const freq = {};
    for (const row of grid) {
      for (const c of row) {
        if (c !== 0) {
          freq[c] = (freq[c] || 0) + 1;
        }
      }
    }
    const sorted = Object.entries(freq).toSorted((a, b) => b[1] - a[1]);
    if (sorted.length < 1) {
      return "up";
    }
    const regionColor = Number(sorted[0][0]);

    const target = findNearest(grid, agentPos, (c) => c === regionColor);
    if (!target) {
      return "up";
    }

    const nav = navigateTo(agentPos, target, obs.allowedActions);
    if (nav) {
      return nav;
    }
    return "toggle";
  },

  // Color map: detect mapping from row 0, apply to rest
  color_map(obs, _mem) {
    const { grid, agentPos } = obs;
    for (let y = 1; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] >= 1 && grid[y][x] <= 4) {
          const nav = navigateTo(agentPos, { x, y }, obs.allowedActions);
          if (nav) {
            return nav;
          }
          return `paint${grid[y][x]}`;
        }
      }
    }
    return "up";
  },
};

// Helpers
function findNearest(grid, pos, pred) {
  let best = null,
    bestDist = Infinity;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (pred(grid[y][x])) {
        const d = Math.abs(x - pos.x) + Math.abs(y - pos.y);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
  }
  return best;
}

function navigateTo(from, to, allowed) {
  if (from.x === to.x && from.y === to.y) {
    return null;
  }
  if (from.x < to.x && allowed.includes("right")) {
    return "right";
  }
  if (from.x > to.x && allowed.includes("left")) {
    return "left";
  }
  if (from.y < to.y && allowed.includes("down")) {
    return "down";
  }
  if (from.y > to.y && allowed.includes("up")) {
    return "up";
  }
  return null;
}

function bfs(grid, start, goal, passable) {
  const h = grid.length,
    w = grid[0].length;
  const key = (x, y) => `${x},${y}`;
  const visited = new Set([key(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y, path: [] }];
  const dirs = [
    ["up", 0, -1],
    ["down", 0, 1],
    ["left", -1, 0],
    ["right", 1, 0],
  ];
  while (queue.length) {
    const { x, y, path } = queue.shift();
    if (x === goal.x && y === goal.y) {
      return path;
    }
    for (const [action, dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (
        nx >= 0 &&
        nx < w &&
        ny >= 0 &&
        ny < h &&
        !visited.has(key(nx, ny)) &&
        passable(grid[ny][nx])
      ) {
        visited.add(key(nx, ny));
        queue.push({ x: nx, y: ny, path: [...path, action] });
      }
    }
  }
  return null;
}

function randomMove(obs) {
  const moves = obs.allowedActions.filter((a) => ["up", "down", "left", "right"].includes(a));
  return moves[Math.floor(Math.random() * moves.length)] || obs.allowedActions[0];
}

// Main agent function
const memory = {};
export function baselineAgent(obs, envId) {
  const strategy = strategies[envId];
  if (strategy) {
    return strategy(obs, memory);
  }
  return randomMove(obs);
}
