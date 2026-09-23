// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Creatiq Millennium Holdings Trust
/**
 * Slug → page/post fields via Ghost Admin API (server-side only).
 * Prefer a least-privilege Content API key when available; Admin JWT works
 * for published slug lookup when Content API creation is unavailable.
 */
import jwt from "jsonwebtoken";

const UA = process.env.OG_USER_AGENT || "Mozilla/5.0 (compatible; OGCardService/1.0)";

function loadAdminKey() {
  const raw = (process.env.GHOST_ADMIN_API_KEY || "").trim();
  if (!raw || !raw.includes(":")) {
    throw new Error(
      "GHOST_ADMIN_API_KEY missing or malformed (expected keyid:secret)"
    );
  }
  const [id, secret] = raw.split(":", 2);
  return { id, secret };
}

function mintToken() {
  const { id, secret } = loadAdminKey();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now, exp: now + 300, aud: "/admin/" },
    Buffer.from(secret, "hex"),
    {
      algorithm: "HS256",
      header: { alg: "HS256", typ: "JWT", kid: id },
    }
  );
}

function baseUrl() {
  const url = (process.env.GHOST_API_URL || "").replace(/\/$/, "");
  if (!url) {
    throw new Error("GHOST_API_URL is required (no default host)");
  }
  return url;
}

async function adminGet(path) {
  const token = mintToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Authorization: `Ghost ${token}`,
      "Accept-Version": "v5.0",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Ghost Admin ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function clamp(s, n) {
  if (!s) return "";
  const cleaned = String(s)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= n) return cleaned;
  const cut = cleaned.slice(0, n - 1);
  const at = cut.lastIndexOf(" ");
  const base = at > n * 0.6 ? cut.slice(0, at) : cut;
  return `${base}…`;
}

function pickSubline(doc) {
  return (
    clamp(doc.custom_excerpt, 200) ||
    clamp(doc.meta_description, 200) ||
    clamp(doc.excerpt, 200) ||
    ""
  );
}

function pickEyebrow(doc) {
  const tag =
    doc.primary_tag?.name ||
    (Array.isArray(doc.tags) && doc.tags[0]?.name);
  if (tag) return clamp(tag, 40);
  // Skip generic site-name eyebrows — the wordmark already carries brand.
  return "";
}

function normalizeDoc(doc, type) {
  if (!doc) return null;
  const title =
    clamp(doc.title, 120) ||
    clamp(process.env.OG_SITE_TITLE || "Untitled", 120);
  return {
    type,
    slug: doc.slug,
    title,
    sub: pickSubline(doc),
    eyebrow: pickEyebrow(doc),
    og_image: doc.og_image || null,
    feature_image: doc.feature_image || null,
  };
}

/**
 * @param {string} slug
 * @param {'page'|'post'} type
 */
export async function resolveSlug(slug, type = "page") {
  const safe = String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 200);
  if (!safe) return null;

  const kind = type === "post" ? "posts" : "pages";
  const path =
    `/ghost/api/admin/${kind}/` +
    `?filter=slug:${encodeURIComponent(safe)}%2Bstatus:published` +
    `&limit=1&formats=`;

  const data = await adminGet(path);
  const list = data[kind] || [];
  if (list.length) {
    return normalizeDoc(list[0], type === "post" ? "post" : "page");
  }
  // Resilience: wrong type in theme still resolves published content.
  const other = kind === "posts" ? "pages" : "posts";
  const otherType = other === "posts" ? "post" : "page";
  const alt =
    `/ghost/api/admin/${other}/` +
    `?filter=slug:${encodeURIComponent(safe)}%2Bstatus:published` +
    `&limit=1&formats=`;
  const altData = await adminGet(alt);
  const altList = altData[other] || [];
  if (!altList.length) return null;
  return normalizeDoc(altList[0], otherType);
}
