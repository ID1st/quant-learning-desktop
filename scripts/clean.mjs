import { rm } from "node:fs/promises";

const targets = ["apps/desktop/dist", "packages/*/dist"];

await Promise.allSettled(targets.map((target) => rm(target, { recursive: true, force: true })));
