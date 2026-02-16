import { BaseEnv } from "./base.mjs";

// 1. PatternFill: Fill empty cells to complete a pattern (horizontal stripes)
export class PatternFillEnv extends BaseEnv {
  static id = "pattern_fill";
  get allowedActions() {
    return ["up", "down", "left", "right", "paint1", "paint2"];
  }

  reset() {
    const r = this._rng(this.seed);
    this._makeGrid(0);
    this.color1 = 1 + Math.floor(r() * 4);
    this.color2 = 5 + Math.floor(r() * 4);
    this.goal = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, () => (y % 2 === 0 ? this.color1 : this.color2)),
    );
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (r() < 0.6) {
          this.grid[y][x] = this.goal[y][x];
        }
      }
    }
    this.agentPos = { x: Math.floor(r() * this.width), y: Math.floor(r() * this.height) };
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    if (action === "paint1") {
      this.grid[this.agentPos.y][this.agentPos.x] = this.color1;
    } else if (action === "paint2") {
      this.grid[this.agentPos.y][this.agentPos.x] = this.color2;
    } else {
      super._applyAction(action);
    }
  }

  _goalReached() {
    return this.grid.every((row, y) => row.every((c, x) => c === this.goal[y][x]));
  }
}

// 2. PathFind: Navigate to a target cell
export class PathFindEnv extends BaseEnv {
  static id = "path_find";

  reset() {
    const r = this._rng(this.seed);
    this._makeGrid(0);
    for (let i = 0; i < Math.floor(this.width * this.height * 0.2); i++) {
      const wx = Math.floor(r() * this.width),
        wy = Math.floor(r() * this.height);
      this.grid[wy][wx] = 9;
    }
    do {
      this.agentPos = { x: Math.floor(r() * this.width), y: Math.floor(r() * this.height) };
    } while (this.grid[this.agentPos.y][this.agentPos.x] === 9);
    this.grid[this.agentPos.y][this.agentPos.x] = 0;
    do {
      this.target = { x: Math.floor(r() * this.width), y: Math.floor(r() * this.height) };
    } while (
      this.grid[this.target.y][this.target.x] === 9 ||
      (this.target.x === this.agentPos.x && this.target.y === this.agentPos.y)
    );
    this.grid[this.target.y][this.target.x] = 3;
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[action];
    if (!d) {
      return;
    }
    const nx = this.agentPos.x + d[0],
      ny = this.agentPos.y + d[1];
    if (this._inBounds(nx, ny) && this.grid[ny][nx] !== 9) {
      this.agentPos = { x: nx, y: ny };
    }
  }

  _goalReached() {
    return this.agentPos.x === this.target.x && this.agentPos.y === this.target.y;
  }
}

// 3. ColorSort: Sort colored cells in a row
export class ColorSortEnv extends BaseEnv {
  static id = "color_sort";
  get allowedActions() {
    return ["left", "right", "pick", "place"];
  }

  reset() {
    const r = this._rng(this.seed);
    this.height = 1;
    this.width = 6;
    this._makeGrid(0);
    const colors = Array.from({ length: this.width }, (_, i) => i + 1);
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    this.grid[0] = colors;
    this.agentPos = { x: 0, y: 0 };
    this.inventory = null;
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    if (action === "left") {
      this._move(-1, 0);
    } else if (action === "right") {
      this._move(1, 0);
    } else if (
      action === "pick" &&
      this.inventory === null &&
      this.grid[0][this.agentPos.x] !== 0
    ) {
      this.inventory = this.grid[0][this.agentPos.x];
      this.grid[0][this.agentPos.x] = 0;
    } else if (
      action === "place" &&
      this.inventory !== null &&
      this.grid[0][this.agentPos.x] === 0
    ) {
      this.grid[0][this.agentPos.x] = this.inventory;
      this.inventory = null;
    }
  }

  _goalReached() {
    if (this.inventory !== null) {
      return false;
    }
    return this.grid[0].every((v, i) => i === 0 || v >= this.grid[0][i - 1]);
  }
}

// 4. MirrorSymmetry: Complete a grid to be vertically symmetric
export class MirrorEnv extends BaseEnv {
  static id = "mirror";
  get allowedActions() {
    return ["up", "down", "left", "right", "paint1", "paint2", "paint3"];
  }

  reset() {
    const r = this._rng(this.seed);
    this._makeGrid(0);
    this.colors = [1 + Math.floor(r() * 3), 4 + Math.floor(r() * 3), 7 + Math.floor(r() * 2)];
    this.goal = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < Math.ceil(this.width / 2); x++) {
        const c = this.colors[Math.floor(r() * this.colors.length)];
        this.goal[y][x] = c;
        this.goal[y][this.width - 1 - x] = c;
      }
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < Math.ceil(this.width / 2); x++) {
        this.grid[y][x] = this.goal[y][x];
      }
    }
    this.agentPos = { x: Math.ceil(this.width / 2), y: 0 };
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    if (action === "paint1") {
      this.grid[this.agentPos.y][this.agentPos.x] = this.colors[0];
    } else if (action === "paint2") {
      this.grid[this.agentPos.y][this.agentPos.x] = this.colors[1];
    } else if (action === "paint3") {
      this.grid[this.agentPos.y][this.agentPos.x] = this.colors[2];
    } else {
      super._applyAction(action);
    }
  }

  _goalReached() {
    return this.grid.every((row, y) => row.every((c, x) => c === this.goal[y][x]));
  }
}

// 5. FloodFill: Paint connected region to target color
export class FloodFillEnv extends BaseEnv {
  static id = "flood_fill";
  get allowedActions() {
    return ["up", "down", "left", "right", "toggle"];
  }

  reset() {
    const r = this._rng(this.seed);
    this._makeGrid(0);
    this.targetColor = 1 + Math.floor(r() * 5);
    const regionColor = 6 + Math.floor(r() * 3);
    const seeds = 2 + Math.floor(r() * 3);
    for (let s = 0; s < seeds; s++) {
      const sx = Math.floor(r() * this.width),
        sy = Math.floor(r() * this.height);
      const q = [[sx, sy]];
      while (q.length) {
        const [cx, cy] = q.shift();
        if (!this._inBounds(cx, cy) || this.grid[cy][cx] !== 0) {
          continue;
        }
        this.grid[cy][cx] = regionColor;
        if (r() < 0.6) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            q.push([cx + dx, cy + dy]);
          }
        }
      }
    }
    this.regionColor = regionColor;
    this.goal = this.grid.map((row) => row.map((c) => (c === regionColor ? this.targetColor : c)));
    this.agentPos = { x: Math.floor(r() * this.width), y: Math.floor(r() * this.height) };
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    if (action === "toggle") {
      const c = this.grid[this.agentPos.y][this.agentPos.x];
      if (c === this.regionColor) {
        this.grid[this.agentPos.y][this.agentPos.x] = this.targetColor;
      } else if (c === this.targetColor) {
        this.grid[this.agentPos.y][this.agentPos.x] = this.regionColor;
      }
    } else {
      super._applyAction(action);
    }
  }

  _goalReached() {
    return this.grid.every((row, y) => row.every((c, x) => c === this.goal[y][x]));
  }
}

// 6. ColorMap: Map each color to another (substitution cipher)
export class ColorMapEnv extends BaseEnv {
  static id = "color_map";
  get allowedActions() {
    return ["up", "down", "left", "right", "paint1", "paint2", "paint3", "paint4"];
  }

  reset() {
    const r = this._rng(this.seed);
    this.width = 5;
    this.height = 5;
    this._makeGrid(0);
    this.srcColors = [1, 2, 3, 4];
    this.dstColors = [5, 6, 7, 8];
    for (let i = this.dstColors.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [this.dstColors[i], this.dstColors[j]] = [this.dstColors[j], this.dstColors[i]];
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x] = this.srcColors[Math.floor(r() * 4)];
      }
    }
    this.goal = this.grid.map((row) =>
      row.map((c) => {
        const idx = this.srcColors.indexOf(c);
        return idx >= 0 ? this.dstColors[idx] : c;
      }),
    );
    for (let x = 0; x < this.width; x++) {
      this.grid[0][x] = this.goal[0][x];
    }
    this.agentPos = { x: 0, y: 1 };
    this.step_count = 0;
    return this.observe();
  }

  _applyAction(action) {
    const paintMap = {
      paint1: this.dstColors[0],
      paint2: this.dstColors[1],
      paint3: this.dstColors[2],
      paint4: this.dstColors[3],
    };
    if (paintMap[action] !== undefined) {
      this.grid[this.agentPos.y][this.agentPos.x] = paintMap[action];
    } else {
      super._applyAction(action);
    }
  }

  _goalReached() {
    return this.grid.every((row, y) => row.every((c, x) => c === this.goal[y][x]));
  }
}

// Registry
export const ENV_REGISTRY = {
  pattern_fill: PatternFillEnv,
  path_find: PathFindEnv,
  color_sort: ColorSortEnv,
  mirror: MirrorEnv,
  flood_fill: FloodFillEnv,
  color_map: ColorMapEnv,
};

export function createEnv(id, opts = {}) {
  const Cls = ENV_REGISTRY[id];
  if (!Cls) {
    throw new Error(`Unknown env: ${id}`);
  }
  return new Cls(opts);
}
