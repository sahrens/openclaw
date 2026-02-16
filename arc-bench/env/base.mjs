// Base environment class for all gridworld tasks
export class BaseEnv {
  constructor({ width = 5, height = 5, maxSteps = 15, seed = 0 }) {
    this.width = width;
    this.height = height;
    this.maxSteps = maxSteps;
    this.seed = seed;
    this.step_count = 0;
    this.grid = [];
    this.agentPos = { x: 0, y: 0 };
    this.inventory = null; // for pick/place envs
  }

  // Simple seeded PRNG (mulberry32)
  _rng(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _makeGrid(fill = 0) {
    this.grid = Array.from({ length: this.height }, () => Array(this.width).fill(fill));
  }

  _inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // Move agent, return true if moved
  _move(dx, dy) {
    const nx = this.agentPos.x + dx,
      ny = this.agentPos.y + dy;
    if (this._inBounds(nx, ny)) {
      this.agentPos = { x: nx, y: ny };
      return true;
    }
    return false;
  }

  get allowedActions() {
    return ["up", "down", "left", "right"];
  }

  reset() {
    throw new Error("implement reset()");
  }

  step(action) {
    if (this.step_count >= this.maxSteps) {
      return { obs: this.observe(), done: true, success: false };
    }
    this.step_count++;
    this._applyAction(action);
    const done = this.step_count >= this.maxSteps || this._goalReached();
    return { obs: this.observe(), done, success: this._goalReached() };
  }

  _applyAction(action) {
    if (action === "up") {
      this._move(0, -1);
    } else if (action === "down") {
      this._move(0, 1);
    } else if (action === "left") {
      this._move(-1, 0);
    } else if (action === "right") {
      this._move(1, 0);
    }
  }

  _goalReached() {
    return false;
  }

  observe() {
    return {
      grid: this.grid.map((r) => [...r]),
      agentPos: { ...this.agentPos },
      step: this.step_count,
      remaining: this.maxSteps - this.step_count,
      allowedActions: this.allowedActions,
      inventory: this.inventory,
    };
  }
}
