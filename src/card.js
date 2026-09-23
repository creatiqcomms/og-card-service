// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Creatiq Millennium Holdings Trust
/**
 * OG card renderer — Satori → SVG → PNG (resvg).
 * Geometry: 1200×630 canvas, 72px margin, auto-fit band 178–520.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const W = 1200;
const H = 630;
const MARGIN = 72;
const BAND_TOP = 178;
const BAND_BOT = 520;
const BAND_H = BAND_BOT - BAND_TOP; // 342
const GAP = 36;
const MAXW = W - MARGIN * 2; // 1056

function requireFont(name) {
  const p = join(ROOT, "assets/fonts", name);
  if (!existsSync(p)) {
    throw new Error(
      `Missing font ${p}. Run: npm run fetch:fonts  (see assets/fonts/README.md)`
    );
  }
  return readFileSync(p);
}

const fontOswald = requireFont("Oswald-Bold.ttf");
const fontDmRegular = requireFont("DMSans-Regular.ttf");
const fontDmSemi = requireFont("DMSans-SemiBold.ttf");
const fontDmBold = requireFont("DMSans-Bold.ttf");

function loadLogoSvg() {
  const candidates = [
    process.env.OG_LOGO_PATH,
    join(ROOT, "assets/logo.svg"),
    join(ROOT, "assets/logo.placeholder.svg"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error(
    "No logo found. Set OG_LOGO_PATH or add assets/logo.svg (see TRADEMARK.md)."
  );
}

const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(loadLogoSvg()).toString("base64")}`;

function footerText() {
  // No vendor hostname default — operators must set OG_FOOTER_TEXT.
  return (process.env.OG_FOOTER_TEXT || "").trim();
}

function defaultTitle() {
  return (process.env.OG_SITE_TITLE || "Untitled").trim() || "Untitled";
}

/** Approximate wrap for Oswald/DM Sans — good enough for auto-fit. */
function wrapText(text, fontSize, maxWidth, avgRatio = 0.55) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  const charW = fontSize * avgRatio;
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length * charW > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitBlock(title, sub) {
  const subLines = wrapText(sub, 25, MAXW, 0.5).slice(0, 2);
  const subH = subLines.length * 34;

  for (let size = 78; size >= 40; size -= 2) {
    let headLines = wrapText(title, size, MAXW, 0.52);
    if (headLines.length > 3) continue;
    const block =
      headLines.length * size * 1.16 + (subLines.length ? GAP + subH : 0);
    if (block <= BAND_H) {
      return { size, headLines, subLines, block };
    }
  }

  let headLines = wrapText(title, 40, MAXW, 0.52);
  if (headLines.length > 3) {
    headLines = headLines.slice(0, 3);
    headLines[2] = `${headLines[2].replace(/\s+\S*$/, "")}…`;
  }
  const block =
    headLines.length * 40 * 1.16 + (subLines.length ? GAP + subH : 0);
  return { size: 40, headLines, subLines, block: Math.min(block, BAND_H) };
}

function cardTree({ title, sub, eyebrow }) {
  const fit = fitBlock(title, sub);
  const yStart = BAND_TOP + (BAND_H - fit.block) / 2;
  const foot = footerText();

  const headChildren = fit.headLines.map((line, i) => ({
    type: "div",
    props: {
      key: `h${i}`,
      style: {
        fontFamily: "Oswald",
        fontWeight: 700,
        fontSize: fit.size,
        lineHeight: 1.16,
        color: "#FAFAFC",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      },
      children: line,
    },
  }));

  const subChildren = fit.subLines.map((line, i) => ({
    type: "div",
    props: {
      key: `s${i}`,
      style: {
        fontFamily: "DM Sans",
        fontWeight: 400,
        fontSize: 25,
        lineHeight: "34px",
        color: "#82828C",
      },
      children: line,
    },
  }));

  return {
    type: "div",
    props: {
      style: {
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundImage:
          "radial-gradient(circle 620px at 88% 10%, rgba(139,92,246,0.30), transparent 70%)," +
          "radial-gradient(circle 520px at 6% 102%, rgba(236,72,153,0.13), transparent 70%)," +
          "linear-gradient(180deg, #0A0A0F 0%, #0A0A0F 100%)",
        overflow: "hidden",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: 6,
              backgroundImage: "linear-gradient(90deg, #8B5CF6, #ec4899)",
            },
          },
        },
        {
          type: "img",
          props: {
            src: logoDataUri,
            width: 168,
            height: 31,
            style: {
              position: "absolute",
              left: MARGIN,
              top: 66,
              width: 168,
              height: 31,
              objectFit: "contain",
            },
          },
        },
        eyebrow
          ? {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  left: MARGIN,
                  top: 128,
                  fontFamily: "DM Sans",
                  fontWeight: 600,
                  fontSize: 17,
                  color: "#8B5CF6",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                },
                children: eyebrow,
              },
            }
          : null,
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: MARGIN,
              top: yStart,
              width: MAXW,
              display: "flex",
              flexDirection: "column",
            },
            children: [
              ...headChildren,
              ...(subChildren.length
                ? [
                    { type: "div", props: { style: { height: GAP, width: 1 } } },
                    ...subChildren,
                  ]
                : []),
            ],
          },
        },
        foot
          ? {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  left: MARGIN,
                  top: 552,
                  fontFamily: "DM Sans",
                  fontWeight: 700,
                  fontSize: 21,
                  color: "#82828C",
                },
                children: foot,
              },
            }
          : null,
      ].filter(Boolean),
    },
  };
}

export async function renderCard({ title, sub = "", eyebrow = "" }) {
  const tree = cardTree({
    title: title || defaultTitle(),
    sub: sub || "",
    eyebrow: eyebrow || "",
  });

  const svg = await satori(tree, {
    width: W,
    height: H,
    fonts: [
      { name: "Oswald", data: fontOswald, weight: 700, style: "normal" },
      { name: "DM Sans", data: fontDmRegular, weight: 400, style: "normal" },
      { name: "DM Sans", data: fontDmSemi, weight: 600, style: "normal" },
      { name: "DM Sans", data: fontDmBold, weight: 700, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
  });
  const png = resvg.render().asPng();
  if (png.byteLength > 1_000_000) {
    throw new Error(`PNG too large: ${png.byteLength}`);
  }
  return Buffer.from(png);
}
