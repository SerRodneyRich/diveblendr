# DiveBlendr v2 — Master Roadmap

**Status:** Approved by owner (SerRodneyRich), 2026-08-07
**Audience:** Implementing AI agents (Claude Opus) and human contributors. Each phase document in this directory is self-contained; read this file first, then the phase document you are executing.

## Mission

DiveBlendr becomes the **best-in-class, free, open-source** technical dive planning suite: gas blending, MOD/END/density analysis, and a full decompression planner (Bühlmann ZHL-16C + gradient factors) with CCR bailout, gas logistics, lost-gas contingency, repetitive dives, and ICD (isobaric counterdiffusion) checks. Paid competitors (e.g. "DTS Gas Guru", $4.99: best mix / gas check / mixer / density / turn pressure / min gas — **no deco planner**) must be strictly dominated by this app. Safety tooling should be free.

## Non-negotiable constraints

1. **License: GPL-3.0 (current repo license — keep it).**
   - The deco engine is ported from **DecoTengu** (Python, GPL-3.0, ZH-L16B/C + gradient factors: https://wrobell.dcmod.org/decotengu/) — license-compatible. Credit prominently (see Attribution below).
   - **Do NOT copy code from Subsurface.** Subsurface `core/deco.cpp` is `SPDX-License-Identifier: GPL-2.0` (v2-**only**), which is incompatible with GPL-3.0. Subsurface may be used as a **validation oracle** (compare planner outputs) and as an algorithm reference via its documentation — output comparison and reading docs carry no license restriction on our code.
   - Erik Baker's published papers ("Understanding M-values", "Clearing Up The Confusion About 'Deep Stops'", gradient factor definition) are the mathematical authority for the implementation.
2. **PWA / offline-first / static export stays.** `output: export`, service worker, all calculations client-side. No backend dependency for any core feature.
3. **Deterministic, pure, tested math.** All calculation code lives in framework-free TypeScript modules under `src/lib/`, unit-tested with golden values. No React imports in math code. No `console.*` in production paths.
4. **Conservative-by-default, transparent always.** Every number the app shows must be reproducible from documented formulas (the in-app KaTeX "show the math" pattern is a differentiator — keep and extend it).
5. **This is planning software, not a dive computer.** Maintain and strengthen disclaimers; the planner UI must require explicit acknowledgment before first use (existing SafetyWarningModal pattern).

## Attribution requirements (do in Phase 1, maintain forever)

- Add `NOTICE.md` at repo root: credits DecoTengu (Artur Wroblewski, GPL-3.0) as the deco-engine port source, Subsurface as validation reference, Erik Baker's papers, NOAA Diving Manual for oxygen exposure tables.
- Ported files carry a header: origin project, origin file, license, and "ported to TypeScript for DiveBlendr".
- In-app: the existing OpenSourceButton modal gains a "Standing on the shoulders of giants" credits section.
- `package.json`: add `"license": "GPL-3.0-only"`.

## Phase plan

Execute phases in order except where marked parallel. **One phase = one agent work session = one PR.** Do not start a phase until its prerequisites are merged.

| Phase | Document | Depends on | Summary |
|---|---|---|---|
| 0 | this file §Phase 0 | — | Housekeeping: dead-code purge, dependency cleanup, test harness (Vitest), CI, CLAUDE.md refresh, NOTICE.md |
| 1 | `01-MATH-AUDIT-AND-FIXES.md` | 0 | Fix all audited math/safety defects; golden-value test suite for existing calculators |
| 2 | `02-DECO-ENGINE-SPEC.md` | 1 | Port + extend deco engine (`src/lib/deco/`): ZHL-16C+GF, schedule generation, CNS/OTU, ICD, CCR, repetitive, gas logistics |
| 3 | `03-UI-FOUNDATION-SPEC.md` | 0 (parallel with 1–2) | Design tokens, primitive component library, route-per-tool IA restructure, accessibility fixes |
| 4 | `04-PLANNER-UI-SPEC.md` | 2 + 3 | The `/planner` route: profile builder, gas plan, schedule output, charts, bailout, repetitive chain |
| 5 | `05-DIVER-PROFILE-SPEC.md` | 3 (UI parts after 4) | Diver profile & certifications: soft gating, tailored warnings, preferences v2 migration |

### Phase 0 — Housekeeping (small, do first)

1. **Delete dead code** (verified unreferenced by UI audit 2026-08-07): `src/components/TabNavigation.tsx`, `AnalyticsStats.tsx`, `Feedback.tsx`, `ReCaptchaProvider.tsx`, `SecurityModal.tsx`, `ConstructionIcon.tsx`, `AccessibilityToolbar.tsx`, `ClientProviders.tsx`, `PhotoCorrectionTab.tsx` (unreachable), `src/components/ui/SliderWithInput.tsx` (never imported — will be superseded by Phase 3 primitives). Re-verify each with a grep for imports before deleting. Note: deleting `Feedback.tsx` removes the (already unmounted) contact form — intentional; owner accepted contact-via-GitHub-issues.
2. **Dependency cleanup** in `package.json`: remove `stripe`, `html2canvas`, `@types/html2canvas`, `react-google-recaptcha-v3`, `@emailjs/browser` (verify unreferenced first). Move `playwright`, `@playwright/test` to `devDependencies` (or remove until E2E exists). Keep `@react-aria/focus` and `@react-aria/live-announcer` (Phase 3 uses them). Keep `@axe-core/react` as devDependency (Phase 3 wires it). Remove security-pin leftovers (`lodash`, `brace-expansion`, `picomatch`) if `pnpm why` shows no direct usage — they were transitive-pin hacks; prefer pnpm `overrides` for pinning.
3. **Note:** repo has migrated npm → **pnpm** (`pnpm-lock.yaml` present, `package-lock.json` deleted). Use pnpm everywhere; update CLAUDE.md commands accordingly.
4. **Test harness:** add `vitest` (devDependency) + `pnpm test` script. Co-locate tests as `*.test.ts` next to sources. Vitest, not Jest (ESM/TS native, Next-compatible).
5. **CI:** GitHub Actions workflow `.github/workflows/ci.yml`: pnpm install → lint → test → build (static export must succeed, all pages prerender). Runs on PR + main.
6. **Env/config cleanup:** remove Stripe + EmailJS + reCAPTCHA vars from `.env.example`; remove `tank-test` phantom entries from `next.config.js` and `public/sw-assets.json`.
7. **NOTICE.md + package.json license field** (see Attribution above).
8. **CLAUDE.md refresh:** routes are `/`, `/calculator`, `/marine-conditions`, `/photo-correction` (no tank-test); pnpm commands; Vitest testing section; remove Stripe/EmailJS rows; keep the pre-commit checklist but add `pnpm test`.

### Success criteria for the whole effort

- Planner outputs match Subsurface (same GF, same gases) within ±1 min per stop and ±5% total runtime on the validation matrix in doc 02.
- Every math module has golden tests; CI green on every PR.
- Lighthouse PWA + accessibility ≥ 95 on all routes.
- A diver can: pick/enter a profile → get best mix → blend it → plan the dive with full deco schedule, min gas, turn pressure, bailout, and CNS/OTU/ICD flags → save/share the plan — entirely offline, entirely free.

## Carried forward — C1–C3, all closed

The three original carried items are resolved (2026-08-21). Three new ones
(N1–N3) were agreed the same day and are open — see **Open — carried to the
next session** below. Nothing in either set blocks Phase 4.

### ~~C1. Warning messages must speak the diver's units~~ — **done, 2026-08-21**

Fixed. `src/lib/units.ts` defines a pure `UnitFormatter` (`METRIC_FORMATTER`,
`IMPERIAL_FORMATTER`, `formatterFor`). It is passed as data into
`generateGasWarnings` / `generatePlanningWarnings` and travels to the engine on
`RecommendationRequest.units`, so `src/lib` still imports no React context.
Metric is the default everywhere, which left every existing metric string
byte-identical — the whole pre-existing suite passed unchanged.

Both footnotes are deleted. Verified in the browser, not just in tests: on
`/mix/` in imperial the engine now says *"Optimised bottom gas reaches only
102 ft against an END of 98 ft, short of the 131 ft you planned"* and
*"END 128 ft exceeds your limit of 98 ft"*, with no bare metres or g/L left
anywhere in the rendered page.

Two deliberate calls:

- **ppO₂ stays in bar in both systems.** Every agency, table and dive computer
  states oxygen partial pressure in bar; converting it to psi would produce a
  number no diver recognises. `UnitFormatter.pressure` is therefore identity in
  imperial. `barToPsi` exists for callers that genuinely want cylinder pressure.
- **Fixed depth-band advisories keep their metric thresholds** (40 m
  recreational, 100 m practical OC limit). Those depths are what the agencies
  publish; only how they are *written* follows the diver, so imperial reads
  "131 ft".

Imperial density renders at two decimals: at one, 5.7 and 7.0 g/L both collapse
to "0.4 lb/ft³", making a target and a critical limit indistinguishable inside a
safety sentence. Covered by a test.

Tests: `src/lib/units.test.ts` (12, derived from the exact 0.3048 m foot rather
than from what the formatter prints), 7 imperial cases in `standards.test.ts`,
and 2 rendered-DOM cases in `ModCheckTool.test.tsx`. All mutation-tested —
reintroducing the defect fails 5 of the standards cases and the DOM case, so
none of them pass vacuously.

### ~~C2. `Input`'s suffix still collides with long values~~ — **done, 2026-08-21**

Fixed with the same sibling-grid-column pattern `NumberField` uses. The suffix
was absolutely positioned inside the input's right padding, held clear by a
fixed `pr-10` — a reserve that is right for "m", too wide for "%" and too
narrow for "lb/ft³", and that a long value simply scrolled underneath.

It is now a real grid column, so it contributes its own width to the track and
the input's usable area follows the actual suffix. Border and glass moved to
the wrapper and are painted once; the input itself is transparent, which avoids
the stacked-translucency seam.

Measured in the browser rather than assumed: with a nine-digit value in the
gallery, the old code overlapped the digits by **24px** (suffix `position:
absolute`); the new code measures **0px**, input right edge exactly meeting
suffix left edge, suffix `position: static` inside a `display: grid` wrapper.
44px touch height is preserved.

jsdom does no layout, so the four tests in `ui.test.tsx` assert the structural
property that made the overlap possible — an absolute span cannot reserve
space, a grid sibling always does — plus the accessibility wiring, since the
suffix carries the unit and labels read "Depth", not "Depth (m)". Three of them
fail against the old component.

### ~~C3. Vestigial two-column field grids~~ — **assessed, no change needed, 2026-08-21**

Re-examined against the container-query `NumberField`. The surviving
`grid-cols-2` wrappers are not vestigial: the two that wrap fields (start/end
pressure in `/sac`, the O₂/He pairs in the blender) deliberately pair *related*
inputs side by side, which reads better than a stacked column, and the
container query now sizes the field correctly inside them — that was the actual
defect. Every other `grid-cols-2` in the tree wraps `StatCard`s, which the
roadmap item never covered. Closing rather than carrying it further; removing
them would be a layout change with no defect behind it.

## Site-wide defects found and fixed, 2026-08-21

Found by running `webshot check` against a clean **production export** on every
route — not the dev server, and not one page. All three appeared on all twelve
routes and none showed as broken layout, which is why they had survived.

### ~~C4. Unit preference caused a hydration mismatch~~ — fixed

React error #418 on every page carrying the units drawer. A static export
generates `out/*.html` once at build time with no diver, so every page ships
metric; `UnitsContext` then switched a US locale to imperial in an effect, the
client disagreed with the HTML, and React discarded and re-rendered the
subtree.

Reading storage in the `useState` initialiser was tried and is **worse**: the
initialiser runs during the hydration render itself, so the first client render
was imperial against metric HTML — the mismatch moved earlier rather than going
away. Measured, not assumed: the toggle rendered `aria-checked={false}` where
the server had `"true"`.

The fix renders the server's value on the hydration pass and adopts the stored
preference in a **layout effect**, which commits before paint — no metric
flash, nothing to mismatch. The persist effect is gated on `hydrated`, or the
metric placeholder would overwrite a saved imperial setting on every load.

### ~~C5. Analytics ran even when unconfigured~~ — fixed

`.env.example` says "leave blank to disable", but both analytics scripts
rendered unconditionally. An unconfigured build requested
`gtag/js?id=undefined`, and GoatCounter's protocol-relative `//gc.zgo.at` made
an HTTP page fetch over HTTP, where the host answers with a **301 HTML page**
that the browser parses as JavaScript — the `Unexpected token '<'` on every
route. Both are now gated on their variables and GoatCounter is pinned to
https.

### ~~C6. `console.log` in production paths~~ — fixed

Five calls, which CLAUDE.md forbids: two in `FavoritesContext`, two in the
`conditions` geocoding fallbacks, one in `PWAButton`.

**State after the fix:** all twelve routes report zero JS errors, zero console
errors, zero failed requests and no horizontal overflow against a clean
production export. The one remaining `_vercel/insights` 404 is the platform
script, absent offline by design.

### Verification note — serve the export without SPA rewriting

`serve -s out` rewrites every unknown path to `index.html`, so **every route
returns the homepage** and a per-page check silently tests `/` twelve times.
This cost real time here. Serve `out/` **without** `-s`; the export already
contains `planner/index.html` and the rest, which is how Vercel serves it.

Also: do not run `rm -rf .next out` while another agent or dev server is using
the tree. Concurrent builds corrupted `.next` and deleted an export mid-run,
producing failures that looked like code defects and were not.

## Open — carried to the next session

Agreed with the owner, 2026-08-21. Do these before merging to `main`.

### N1. `/conditions/` shows synthetic tide data

The page falls back to a sinusoid (`generateSyntheticTideData`) and labels it
"Synthetic". The owner sees that fallback where real data should appear.

**The API is not the problem — checked.** A live request for Vanuatu
(`marine-api.open-meteo.com/v1/marine?...&hourly=sea_level_height_msl&timezone=auto&forecast_days=7`)
returns 168 hourly values, no nulls, covering today. So the fallback is being
taken in the page.

`processRealTideData` in `src/app/(tools)/conditions/page.tsx` has three exits
to synthetic, and the first is the prime suspect:

```
const targetDateStr = baseDate.toISOString().split('T')[0]   // UTC date
const startIndex = marineData.hourly.time.findIndex(t => t.startsWith(targetDateStr))
if (startIndex === -1) return generateSyntheticTideData(baseDate)
```

The request sends `timezone=auto`, so the API returns **local** timestamps
(`2026-08-21T00:00`), while `toISOString()` yields the **UTC** date. At UTC+11
those disagree for 11 hours of every day, and the same expression is used
again for the sunrise/sunset lookup. It did not fire on the day it was tested,
which is exactly why it needs a deliberate fix rather than a retest.

The second exit — `tideHeights.length < 24` — will also fire on the last day of
the 7-day window, which has fewer than 24 remaining hours.

Two further things to settle while in there:

- **Should the synthetic fallback exist at all?** Invented tide data on a dive
  planning tool is the same class of problem as the invented photo presets and
  the invented colour recovery: a plausible-looking number with nothing behind
  it. "No tide data for this location" is more useful than a sinusoid, and the
  "Synthetic" badge is easy to miss. Owner's call.
- `TideChart.tsx` hardcodes `toLocaleDateString('en-US', …)` in several places,
  which ignores the diver's locale.

### N2. Consolidate the What's New modal

`releases` in `src/components/WhatsNewModal.tsx` holds 16 entries: 2 from April
and **14 from the v2 rebuild**, which has never shipped. A diver opening the
modal after release would read fourteen entries describing changes to an app
they never saw.

Collapse everything since April into **one** release entry describing v2 as a
whole — new tools (share card, rebuilt photo editor), the safety fixes
(operating depth, units in warnings), and the redesign. Keep the two April
entries as history. Set the date at release, not before.

### N3. Usability audit before merging to `main`

A pass over the whole app as a diver meets it, not as the person who built it.
Nothing here is a known defect; the point is to find the ones nobody has
looked for. At minimum:

- **Every route at a laptop viewport** (1440x700 and 1280x720), not just
  1440x900. The drawer and the share card both overflowed there and it was
  only found by looking.
- **Mobile**, properly — the bottom bar holds 3 + More, and six tools now live
  behind "More".
- **First-run state of every tool**: what a diver sees before entering
  anything, and whether it explains itself.
- **Keyboard and screen reader** on the share card and photo editor, both of
  which are new and neither of which has been checked that way.
- **The empty and error paths**: an unparseable dive log, a RAW photo, a
  location with no marine data.
- **Imperial throughout.** C1 fixed the warning text, but the whole app in feet
  has not been walked end to end.
- Re-run `webshot check` on every route against a clean production export, and
  `webshot sizes` for overflow at all six breakpoints.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-07 | Deco model: Bühlmann ZHL-16C + GF only (VPM-B possible later behind same engine interface) | Open standard; matches Shearwater/Subsurface defaults; single validation surface |
| 2026-08-07 | Keep GPL-3.0; port DecoTengu; Subsurface as oracle only | Subsurface is GPL-2.0-only → incompatible with in-repo GPL-3.0 code. Owner may alternatively relicense repo to GPL-2.0 to port Subsurface directly — NOT chosen for now |
| 2026-08-07 | Full UI redesign approved (supersedes earlier "polish-only" preference) | Planner needs first-class IA; current UI has no design system |
| 2026-08-07 | Diver profile/certifications = soft gating (warn + acknowledge), never hard locks | Safety tool must inform, not obstruct; divers train beyond certs under instruction |
| 2026-04-14 → obsolete | ~~Next.js pinned ≤15.5.2~~ | Repo now on ^15.5.15 and building; pin no longer applies |
| 2026-08-08 | "MOD" alone is never the number a diver is shown. Every depth a diver acts on comes from `operatingDepth()` — the shallowest of the oxygen, narcosis and density limits — and the UI names which one binds | The oxygen MOD is not an operating depth. Air on a 1.30 bar CCR setpoint reads 51 m on ppO₂ alone while narcosis binds it to 30 m and density to 38 m. The app showed 51 m with both breaches in cards beside it |
| 2026-08-08 | END, density and CNS are evaluated at the depth the **diver asked for**, never at the operating depth | Clamping the analysis depth to the operating depth makes every gas evaluate as clean *by construction* — the depth was chosen because it satisfies the limits, so breaches always test inside them and the warnings silently vanish. Nearly shipped; caught by four engine tests. Both directions now have permanent tests in `standards.test.ts` |
| 2026-08-08 | Deco switch depths and the `DECO_GASES` loop stay oxygen-only | A deco switch is a ppO₂ decision on ascent. Checked rather than assumed: EAN50 is oxygen-limited at 22 m against narcosis 53 m, EAN80 at 10 m against 148 m — narcosis and density never bind a deco gas at its switch depth |
| 2026-08-08 | Safety-critical UI is verified against the **rendered** production export, not the hook return | `src/lib` was fully green while the page displayed air to 51 m. Pure-math tests cannot catch a page that shows the wrong field. `ModCheckTool.test.tsx` asserts the DOM and re-derives limits from the physics rather than comparing one rendered field to another — under the original defect both fields showed the same wrong number, so a field-to-field check passed |
| 2026-08-21 | Message text takes a pure `UnitFormatter` as a parameter; metric is the default | The warnings module and engine must stay framework-free (constraint 3), so they cannot read `UnitsContext`. Passing a formatter as data keeps `src/lib` pure and made the change a no-op for every existing metric string — the whole pre-existing suite passed unchanged |
| 2026-08-21 | ppO₂ stays in **bar** in both unit systems | Every agency, table and dive computer states oxygen partial pressure in bar. Converting it to psi would produce a number no diver recognises inside a safety sentence. `UnitFormatter.pressure` is identity in imperial |
| 2026-08-21 | Fixed depth-band advisories keep metric **thresholds**, convert only their **text** | 40 m recreational and 100 m practical-OC are the depths the agencies publish; they are not the diver's preference. Only how they are written follows the diver |
| 2026-08-21 | Imperial density renders at two decimals | At one decimal 5.7 and 7.0 g/L both collapse to "0.4 lb/ft³", making a target and a critical limit indistinguishable inside a warning. Covered by a test |
