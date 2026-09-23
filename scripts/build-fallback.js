// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Creatiq Millennium Holdings Trust
/** Pre-render static fallback card (site title, no slug). */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCard } from "../src/card.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "assets", "fallback.png");

const png = await renderCard({
  title: process.env.OG_SITE_TITLE || "Untitled",
  sub:
    process.env.OG_FALLBACK_SUB ||
    "Add OG_FALLBACK_SUB and OG_SITE_TITLE for your brand.",
  eyebrow: "",
});
writeFileSync(out, png);
console.log("wrote", out, png.byteLength, "bytes");
