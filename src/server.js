// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Creatiq Millennium Holdings Trust
/**
 * OG Card Service
 * Contract: GET /card?v=1&slug=<slug>&type=page|post → image/png 1200×630
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSlug } from "./ghost.js";
import { renderCard } from "./card.js";
import { cacheKey, readCache, writeCache } from "./cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8095);
const BIND = process.env.OG_BIND || "127.0.0.1";
const FALLBACK = join(__dirname, "..", "assets", "fallback.png");

function sendPng(res, buf, { cacheHit = false } = {}) {
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": buf.byteLength,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-OG-Cache": cacheHit ? "HIT" : "MISS",
  });
  res.end(buf);
}

function sendFallback(res, reason) {
  console.error(`[og-card] fallback: ${reason}`);
  if (existsSync(FALLBACK)) {
    const buf = readFileSync(FALLBACK);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": buf.byteLength,
      "Cache-Control": "public, max-age=60",
      "X-OG-Cache": "FALLBACK",
      "X-OG-Reason": String(reason).slice(0, 80),
    });
    res.end(buf);
    return;
  }
  res.writeHead(200, { "Content-Type": "image/png", "X-OG-Cache": "EMPTY" });
  res.end(Buffer.alloc(0));
}

async function handleCard(url, res) {
  const v = url.searchParams.get("v") || "1";
  const slug = url.searchParams.get("slug") || "";
  const type =
    (url.searchParams.get("type") || "page").toLowerCase() === "post"
      ? "post"
      : "page";

  if (!slug) {
    return sendFallback(res, "missing_slug");
  }

  const qs = `v=${encodeURIComponent(v)}&slug=${encodeURIComponent(slug)}&type=${type}`;
  const key = cacheKey(qs);
  const cached = readCache(key);
  if (cached) {
    return sendPng(res, cached, { cacheHit: true });
  }

  let doc;
  try {
    doc = await resolveSlug(slug, type);
  } catch (err) {
    console.error("[og-card] ghost lookup failed", err.message);
    return sendFallback(res, "ghost_unreachable");
  }

  if (!doc) {
    return sendFallback(res, "slug_not_found");
  }

  try {
    const png = await renderCard({
      title: doc.title,
      sub: doc.sub,
      eyebrow: doc.eyebrow,
    });
    writeCache(key, png);
    return sendPng(res, png, { cacheHit: false });
  } catch (err) {
    console.error("[og-card] render failed", err);
    return sendFallback(res, "render_error");
  }
}

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (url.pathname === "/health" || url.pathname === "/")
    ) {
      const body = JSON.stringify({ status: "ok", service: "og-card" });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      if (req.method === "HEAD") res.end();
      else res.end(body);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/card") {
      if (req.method === "HEAD") {
        const origEnd = res.end.bind(res);
        res.end = () => origEnd();
      }
      await handleCard(url, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (err) {
    console.error("[og-card] unhandled", err);
    sendFallback(res, "unhandled");
  }
});

server.listen(PORT, BIND, () => {
  console.log(`[og-card] listening on ${BIND}:${PORT}`);
});
