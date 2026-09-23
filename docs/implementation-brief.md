# Implementation Brief — Dynamic OG Card Service

**Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (this document). Software in the sibling repository is Apache-2.0 — see that repo’s `README.md` for the split.

**Status:** Reference architecture for operators. Originally designed for Creatiq Communications.

---

## 1. What this is and why it is not a script

Every retail page on a marketing site needs a social card. Producing one by hand per page does not scale, and a site redesign invalidates the whole set at once.

**A script on the page cannot solve this.** Social crawlers — Facebook, X, LinkedIn, Slack, WhatsApp, iMessage — do not execute JavaScript. They fetch the raw HTML, read `<meta property="og:image">`, and then fetch whatever URL that points at as an image file. Anything rendered client-side is invisible to them.

The solution is a small **image endpoint**: a service that returns a 1200×630 PNG, with the Ghost theme pointing at it. Cards are then generated from page content at request time, and a redesign is a single template change rather than a re-export of every asset.

### WordPress and other CMSes

Facebook and LinkedIn (and peers) only require a public `og:image` URL that returns a real PNG. That half of the system is **CMS-agnostic** and has been confirmed on Facebook and LinkedIn in production.

What is Ghost-specific is the **slug → fields** lookup (Ghost Admin API). WordPress needs a different resolver — typically the REST API (`/wp-json/wp/v2/pages?slug=…` or posts) or a small plugin — plus theme or SEO-plugin wiring so the generator fires only when no featured / custom social image exists (Yoast, Rank Math, and similar).

Do not treat this repository as a drop-in WordPress plugin. Reuse the renderer and endpoint contract; replace the content provider.

---

## 2. Stack

| Component | Choice | Why |
|---|---|---|
| Renderer | **Satori** (`satori`, Vercel) | HTML/CSS → SVG. ~10–50ms per card, no headless browser. Supports custom fonts and gradients |
| Rasteriser | **`@resvg/resvg-js`** | SVG → PNG |
| Host | Node service behind your reverse proxy | Keep the endpoint off the Ghost origin |
| Domain | Operator-chosen hostname | **No vendor default** — configure DNS yourself |

`@vercel/og` is Vercel-only. Use Satori directly.

---

## 3. Precedence — when the generator fires

Recommended ruling: **posts keep their feature image** when present. The generator is the fallback, not the default.

1. **Explicit social image** set in the editor (`og_image`) → wins. Manual override.
2. **Feature image** → wins next. Covers posts.
3. **Generated card** → fires only when neither exists. Covers pages, and any post without an image.

Volume is therefore low. Caching is trivial.

---

## 4. Endpoint contract — security decision

The obvious contract passes text in the query string:

```
https://YOUR_OG_HOST/card?v=1&title=...&sub=...&eyebrow=...
```

**This is abusable.** A public text-to-image endpoint on your domain lets anyone render arbitrary words inside your brand furniture and host the result at your hostname. That image can then be shared anywhere as apparent brand output.

### Recommended: slug lookup

```
https://YOUR_OG_HOST/card?v=1&slug=your-page-slug&type=page
```

The service resolves title, excerpt and eyebrow **server-side via the Ghost Admin API** (or a least-privilege Content API key when available). Benefits:

- Arbitrary text cannot be injected — only real published content renders
- The URL is short and stable, so cache keys are clean
- The theme template gets simpler

Cost: one Ghost API call per cold render. Cache the lookup alongside the image.

### Alternative: signed params

Keep query params, append an HMAC of the parameter string using a server-side secret. Rejects unsigned requests. **Problem: the Ghost theme cannot compute an HMAC in Handlebars**, so the signature would have to be pre-generated per page — which reintroduces manual work and defeats the purpose.

**Recommendation: slug lookup.**

### Response

| Property | Value |
|---|---|
| Status | `200` |
| Content-Type | `image/png` |
| Dimensions | **1200 × 630** |
| File size | Target < 300 KB. Hard ceiling 1 MB |
| Auth | **None.** Must be publicly fetchable, no redirect chain, no cookie wall |

Crawlers time out at roughly 5–10 seconds and do not retry politely. A redirect or an auth challenge produces no preview at all.

---

## 5. Card geometry — authoritative

Canvas **1200 × 630**. All content inside a **72px** margin, which sits safely within the 1080 × 570 crop-safe zone.

### Background — generated, not an image

No asset required. Satori supports `linear-gradient` and `radial-gradient` natively.

| Layer | Spec |
|---|---|
| Ground | `#0A0A0F` |
| Glow A | Radial, centre `88% 10%`, radius ~620px, `#8B5CF6`, peak alpha `0.30`, falloff squared |
| Glow B | Radial, centre `6% 102%`, radius ~520px, `#ec4899`, peak alpha `0.13`, falloff squared |
| Top rule | 6px full-bleed, `linear-gradient(90deg, #8B5CF6, #ec4899)` |

### Elements

| Element | Position | Type |
|---|---|---|
| Wordmark | x 72, y 66 | Your knockout SVG via `OG_LOGO_PATH` (see `TRADEMARK.md`). Height ~28–31px |
| Eyebrow | x 72, y 128 | DM Sans 600, 17px, uppercase, `#8B5CF6`, tracking 0.2em — typically primary tag |
| Headline | band 178–520 | Oswald 700, auto-fit 78→40px, line-height 1.16, `#FAFAFC`, max 3 lines |
| Subline | after 36px gap | DM Sans 400, 25px, line-height 34px, `#82828C`, max 2 lines |
| Footer | x 72, y 552 | DM Sans 700, 21px, `#82828C` — set via `OG_FOOTER_TEXT` |

**Fonts must be embedded in the service** (Oswald + DM Sans). Satori does not fetch system fonts. This repository does not vendor the binaries; run `npm run fetch:fonts` (OFL).

### Auto-fit: constrain the block, not the line count

The naive approach caps the headline at 3 lines. That fails: a 3-line headline at full size collides with the subline and the footer.

Fit the **whole block** against the available band:

```
BAND = 178 .. 520          # 342px available
GAP  = 36

sub_lines = wrap(sub, 25px, maxw)[:2]

for size in 78 down to 40 step 2:
    head_lines = wrap(title, size, maxw)
    if len(head_lines) > 3: continue
    block = len(head_lines) * size * 1.16 + GAP + len(sub_lines) * 34
    if block <= (BAND_BOT - BAND_TOP):
        use this size
        break

y = BAND_TOP + (BAND_HEIGHT - block) / 2     # vertically centred
```

Truncate with an ellipsis if a title still exceeds 3 lines at 40px.

---

## 6. Ghost theme change

In `default.hbs`, inside `<head>`, **after** `{{ghost_head}}`:

```hbs
{{#is "page"}}
{{#page}}
  {{#unless og_image}}{{#unless feature_image}}
  <meta property="og:image" content="https://YOUR_OG_HOST/card?v=1&slug={{slug}}&type=page">
  <meta name="twitter:image" content="https://YOUR_OG_HOST/card?v=1&slug={{slug}}&type=page">
  {{/unless}}{{/unless}}
{{/page}}
{{/is}}
<meta name="twitter:card" content="summary_large_image">
```

Mirror for posts with `{{#is "post"}}` / `{{#post}}` and `type=post`. Verify helper availability against your Ghost version before shipping.

`twitter:card` must be `summary_large_image` unconditionally, or X renders a small square thumbnail regardless of the image supplied.

### Ordering constraint — the site-wide default social image

Ghost has a **site-wide default social image** in Settings. While it is set, `{{ghost_head}}` emits an `og:image` on *every* page regardless of feature image — so the fallback above never gets a clear run and the page ships two competing tags. `{{ghost_head}}` output cannot be suppressed selectively.

Sequence matters:

1. Deploy and verify the endpoint is serving
2. Deploy the theme change
3. **Then** clear the site-wide default social image

Clearing it first leaves pages with no card at all in the interval.

---

## 7. Caching

- **Cache key:** full query string including `v`
- **Response header:** `Cache-Control: public, max-age=31536000, immutable` — safe because `v` changes invalidate
- **Server-side:** on-disk or LRU cache of rendered PNGs. First render populates; subsequent are file reads
- **Cache-busting:** bump `v` in the theme template to invalidate every card at once. **This is the mechanism that makes a redesign cheap** — build it in now, not later
- Crawler caches (Facebook, LinkedIn) are sticky and hold old cards for a long time. Bumping `v` changes the URL, which is the only reliable way to force a refresh

---

## 8. Failure modes

| Condition | Required behaviour |
|---|---|
| Render throws | **Serve a static fallback card, HTTP 200.** Never 500 — a 500 means no preview at all |
| Slug not found | Static fallback card |
| Title missing/empty | Fall back to site title |
| Subline missing | Render headline only, vertically centred |
| Ghost API unreachable | Serve last cached render; static fallback if none |
| Title exceeds 3 lines at 40px | Truncate with ellipsis |

Clamp input lengths regardless of contract: title 120 chars, subline 200, eyebrow 40. Strip control characters.

---

## 9. Post-deploy verification

1. `YOUR_OG_HOST/card?v=1&slug=<known-page>&type=page` returns **200**, `image/png`, **1200×630**.
2. Cold render completes in **< 1s**.
3. Cached render returns in **< 100ms**.
4. View source on a page without feature/`og_image` — exactly **one** `og:image` tag (the generator).
5. Same check on a post with a feature image — the tag is Ghost's, not the generator's.
6. Same check on a post *without* a feature image — the tag is the generator's.
7. Facebook Sharing Debugger, X Card Validator and LinkedIn Post Inspector all render the card.
8. Force a render failure — confirm the static fallback is served with **200**, not 500.
9. Bump `v` — confirm a new URL and a fresh crawl.
10. Visual check: nothing important outside the 1080×570 crop-safe zone.
