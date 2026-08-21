# Phase 3 — UI Foundation & Redesign Specification

**Prerequisite:** Phase 0. Runs parallel to Phases 1–2. Full redesign is approved — the PWA/offline/static-export architecture is sacred, the visuals are not.
**Grounding:** UI audit 2026-08-07 (key numbers cited inline; re-verify locations before editing).

## Goals
1. A tokenized design system + small primitive library replacing today's 144 ad-hoc buttons, 16 hand-rolled modal overlays, ≥4 slider implementations, and 3 segmented-control implementations.
2. Route-per-tool information architecture that gives every tool a URL and creates the slot the Phase 4 `/planner` route drops into.
3. Real accessibility (current implementation is partly theater — see §6).
4. A modern, credible visual identity that a diver trusts with their life-support math.

## 1. Design tokens (Tailwind v4 `@theme` in `src/app/globals.css`)

Today: no config, no tokens; hardcoded `#eab308` scrollbars/focus, `bg-gray-700` ×108, `text-yellow-400` ×79, ~10 hues with no roles, z-index values up to `z-[9999]`, manifest `theme_color` blue vs yellow brand.

Define as CSS variables under `@theme` (names final, values are the designer-agent's craft within these constraints):
- **Surfaces (dark-first):** `--color-surface-0..3` — replace gray-800/700/600 ladder with a blue-tinted deep-ocean neutral ramp (not pure gray — this is a diving app; a subtle cold cast reads "depth" and modernizes instantly).
- **Brand:** keep **yellow/amber accent** for continuity (`--color-accent`), but reserve it for primary actions + key values only; today it is spent everywhere.
- **Semantic:** `--color-info / success / warning / danger` mapped to the existing severity system (blue/green/amber/red) — WarningIconStack severities must map 1:1.
- **Gas species (used by charts + planner):** `--color-o2` (green family), `--color-he` (violet family), `--color-n2` (slate family) — currently informal in RecommendationCard; make canonical. Must pass 4.5:1 on surface-0 as text.
- **Type:** wire the already-loaded Geist fonts (`--font-sans: var(--font-geist-sans)`, mono for numerals/tables — deco runtimes in tabular figures `font-variant-numeric: tabular-nums`). Define a 5-step heading scale.
- **Radius, spacing, z-index scales:** 3 radii (`sm/md/full`), spacing stays Tailwind default, z-index tokens: `--z-nav/overlay/modal/toast` (4 layers, kill `z-[9999]`).
- **Theme strategy:** dark-only at launch but *every* color through tokens so light mode is a later variable swap. Delete the light-first `dark:` islands (`AccessibilitySettings`, `UnitsToggle`) by converting them to tokens. Fix `manifest.json` `theme_color` to the new surface color.

## 2. Primitive library (`src/components/ui/`)

Build on **already-installed** `@react-aria/focus` + `@react-aria/live-announcer`; add `clsx`, `cva` (class-variance-authority), `tailwind-merge` (tiny, no component framework — keeps bundle small and GPL-clean). No shadcn/Radix unless a primitive proves genuinely hard (dialog focus trap is covered by react-aria's `FocusScope`).

Primitives (each with variants via `cva`, JSDoc, and a usage test):
- `Button` (primary/secondary/ghost/danger × sm/md/lg, loading state, icon slot) — replaces 144 raw buttons.
- `Card` + `StatCard` (label, value, unit, severity tint, optional sparkline slot) — the shared results vocabulary for AnalysisResults, ModCheckResults, BottomTime, GasBlender, and Phase 4 planner outputs (runtime, TTS, CNS%, OTU, gas required).
- `Modal` — one implementation: `FocusScope` trap + restore, `role="dialog"` `aria-modal`, Escape, backdrop, size variants, scroll-lock. Migrate all 10+ modals; delete every per-modal `fixed inset-0` copy.
- `Input`, `NumberField` (unit suffix, min/max, stepper), `Select`, `SegmentedControl` (consolidates DiveModeSelector, GasTypeSelector, PreferencesModal inline buttons), `Slider` (replaces the 4 hand-rolled `type="range"` patterns; supersedes dead `ui/SliderWithInput.tsx`), `Switch`, `Tabs` (accessible, URL-syncable), `Tooltip` (must work on touch — tap-to-toggle), `Banner/Alert` (severity), `Table` (for runtime schedules: sticky header, mono numerals).
- Touch targets ≥ 44×44 px across all primitives.

## 3. Information architecture — route per tool

Today: `calculator/page.tsx` (1,643 lines) multiplexes 7 tools as invisible client-side tabs; no URLs; marine-conditions links with `?tab=` that the calculator never parses (live bug); cross-page nav uses `window.location.href` full reloads (5 sites).

Target routes (static export handles this — marine-conditions/photo-correction prove it):
```
/                    → redesigned landing: tool catalog + safety banner (see §5)
/mix                 → best-mix recommendations (current "recommendations")
/mix/check           → MOD check ("modcheck")
/blender             → gas blender (mixer + blender merge into one tool w/ modes)
/sac                 → SAC calculator
/gas-planning        → bottom time / turn pressure / min gas (Phase 2 logistics UI home)
/planner             → Phase 4 (placeholder "coming soon" card this phase)
/conditions          → marine-conditions (rename route, redirect old)
/photo               → photo-correction (rename, redirect old)
/links, /about       → links page; open-source/credits/audits content
```
- Shared `src/app/(tools)/layout.tsx`: app chrome (see §4), preserving context state across client-side navigation (`next/link` everywhere; zero `window.location.href`).
- Old URLs (`/calculator#mixer`, `?tab=`) get redirect shims.
- Decompose `calculator/page.tsx`: each tool becomes a route page composing existing tool components; page-level reducer splits into per-tool state + a shared `DivePlanContext` (skeleton this phase — full shape in Phase 4: current mix, tank, SAC flow between tools).

## 4. App chrome & navigation

Today: hamburger-only nav (top-right), floating FAB stack bottom-right (`VerticalMenu`), floating warnings bottom-left (`WarningIconStack`), no current-tool indicator on mobile, three crowded corners.

Target:
- **Desktop (≥ lg):** persistent left sidebar — tool list (icons + labels), grouped: Plan (planner, gas-planning) / Gases (mix, check, blender) / Utilities (SAC, conditions, photo) / bottom: preferences gear, accessibility, install, open-source. Content area max-w constrained.
- **Mobile:** bottom tab bar with 4 top tools (Planner, Mix, Blender, More) + sheet for the rest; sticky compact header with current tool name + gear. Kill the FAB stack; PWA install + network status fold into the More sheet / a toast.
- **Warnings:** inline `Banner` stack at top of each tool's results (severity-ordered) + a persistent count chip in the header; tooltips-on-hover die (mobile can't hover).
- Nav config is one typed array (icon, label, route, group, badge) — Phase 4/5 add entries, not markup.

## 4b. App icon & brand mark (owner-requested, 2026-08-07)

The current icon (`public/icons/icon*.png`) is a pre-Studio holdover: a detailed illustration
(dive mask + regulator + two fish + bubbles + wave layers) inside a light circle on near-black.
Problems, all verifiable in `public/manifest.json` and the asset itself:
- **Too much detail for the sizes that matter.** It is legible at 512 px and mush at 48 px
  (browser tab, Android launcher, iOS Spotlight). An app icon is read at ~1/10 the size it is designed at.
- **Maskable is wrong.** The manifest lists the *same square assets* for `"purpose": "maskable"`
  as for `"any"`. Android applies a circular/squircle mask with a 40% safe zone; these get clipped.
  Maskable icons need their own asset with the mark inside the safe zone and a bleed background.
- **No favicon.** `public/` has no `.ico`/`.svg` favicon; only the PNG set.
- **Theme color mismatch** — manifest `theme_color` is `#1e40af` (blue) while the app's accent is yellow.
  Resolve against the §1 tokens.

**Deliverable:** a new mark generated with **Apiary/Studio** (owner has it available — use
`mcp__apiary__generate_image`; iterate on prompts, do not hand-draw in SVG unless it beats the render).
Requirements:
- One idea, not a scene. Candidate directions: the gas-fraction triangle (O₂/He/N₂), a depth/pressure
  glyph, a stylised isobar or tissue-loading curve. It should say *instrument*, not *holiday snapshot* —
  this is a planning tool that competes with dive-computer software.
- Legible as a 2-tone silhouette at 32 px. Test by rendering at 32/48/64 px and looking at it.
- Ship: `any` set (128/152/167/180/192/512), a **separate** `maskable` set with 40% safe zone,
  `favicon.svg` + `favicon.ico`, and an `apple-touch-icon`. Update `manifest.json` to point `maskable`
  at the maskable assets, and fix `theme_color`.
- Keep the source (prompt + master asset) in `docs/brand/` so it can be regenerated.

## 4c. Replace WhatsNewModal with a simple timeline (owner decision, 2026-08-07)

`WhatsNewModal.tsx` (~350 lines) hand-maintains a `recentCommits` array of full commit
records — hash, author, description, file lists, impact rating — duplicating information git
already holds authoritatively. It has drifted from reality (an April entry claims the static
export crash was fixed; it was not, and it recurred until Phase 0), and CLAUDE.md's pre-commit
routine spends effort keeping it current.

**Replace with:**
- A lightweight **release timeline**: date + one-line summary + type badge, for meaningful
  user-facing changes only (roughly one entry per release, not per commit). Hand-curated is
  fine — the point is that it is short enough to stay honest.
- A **"Full changelog on GitHub"** link out to the repo's commits/releases page for anyone who
  wants detail. Do not restate commit bodies, file lists, hashes, or authorship in-app.
- Drop the `hash`/`author`/`files`/`impact` fields from the data model entirely.
- While reworking this surface, add a short **"Built with humans and AI"** credit to the
  About/OpenSource modal (wording mirroring `NOTICE.md` § "How this software was built"):
  the maintainer works alongside Claude (Fable/Opus), and the reason it is safe to trust is
  that every formula cites a standard and is tested — not who typed it. Owner decision,
  2026-08-07; be matter-of-fact, not promotional.
- Remove step 3 (the WhatsNewModal update) from the CLAUDE.md pre-commit checklist and replace
  it with "add a timeline entry if this release changes something a diver would notice."

## 5. Landing page

42-line splash that blocks on a background image and says nothing. Rebuild: instant-render hero (no image-gate), one-line mission ("Professional dive planning. Free, open source, offline."), tool grid cards (each tool: icon, one-liner, deep link), safety disclaimer banner, GitHub/credits footer. This page is the pitch against paid apps — it should show the feature breadth immediately.

## 6. Accessibility — make it real

- `layout.tsx:24`: **remove `user-scalable=no`** (WCAG 1.4.4 failure).
- `AccessibilityContext.tsx:105-108`: `announceToScreenReader` is a stub that `console.log`s — wire `@react-aria/live-announcer` for calculation-result announcements.
- High-contrast mode sets `--tw-*` variables Tailwind never reads (`globals.css:97-131`) — reimplement as a token override class on `:root` (real values for surface/text/border tokens), or remove the toggle. With tokens from §1 this becomes trivial — do it, don't cut it.
- Render the skip-nav link (CSS exists, link doesn't); focus management via the one `Modal`; `aria-current` in nav; wire `@axe-core/react` in dev; add an axe smoke test per route (vitest + jsdom or playwright when E2E lands).
- Keep/extend the good bits: ParameterControls' aria-value patterns, reduced-motion respect (all new animation behind `motion-safe:`).

## 7. Migration order (each step ships green)
1. Tokens + fonts + chrome shell (sidebar/bottom-bar) with old pages inside.
2. Primitives; migrate modals (worst a11y debt) and buttons opportunistically per screen.
3. Route split of calculator tools, one tool per PR; redirect shims; delete the god page when empty.
4. Landing rebuild; warnings/FAB rationalization; accessibility completion; delete dead `dark:` islands, dead CSS, `Chip`→primitive, `AuditsModal` glassmorphism → standard `Modal`.

## Definition of done
- Zero `fixed inset-0` outside `ui/Modal`; zero raw `<button>` in pages/tools (grep-gated).
- Every tool has a URL; browser back/forward works; `?tab=` bug gone; no `window.location.href` navigation.
- Lighthouse a11y ≥ 95 all routes; pinch-zoom works; axe smoke tests pass.
- `pnpm build` static export green; WhatsNewModal updated per CLAUDE.md.
