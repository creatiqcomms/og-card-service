// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Creatiq Millennium Holdings Trust
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.OG_CACHE_DIR || join(__dirname, "..", "cache");

mkdirSync(CACHE_DIR, { recursive: true });

export function cacheKey(queryString) {
  return createHash("sha256").update(queryString).digest("hex");
}

export function cachePath(key) {
  return join(CACHE_DIR, `${key}.png`);
}

export function readCache(key) {
  const p = cachePath(key);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}

export function writeCache(key, buf) {
  const p = cachePath(key);
  writeFileSync(p, buf);
  return p;
}
