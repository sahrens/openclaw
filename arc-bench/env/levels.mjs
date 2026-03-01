// Level definitions: train + eval splits
// Each level = { envId, seed, width?, height?, maxSteps? }

const ENVS = ["pattern_fill", "path_find", "color_sort", "mirror", "flood_fill", "color_map"];

function genLevels(envId, seeds, maxSteps = 15) {
  const size = envId === "color_sort" ? { width: 6, height: 1 } : { width: 5, height: 5 };
  return seeds.map((seed) => ({ envId, seed, ...size, maxSteps }));
}

// Train: seeds 1-5 per env = 30 levels
export const TRAIN_LEVELS = ENVS.flatMap((e) => genLevels(e, [1, 2, 3, 4, 5]));

// Eval: seeds 100-102 per env = 18 levels (hidden)
export const EVAL_LEVELS = ENVS.flatMap((e) => genLevels(e, [100, 101, 102]));
