# Visual Baseline — captured 2026-08-07 (pre-v2-rebuild)

Captured with [webshot](https://github.com/) (playwright-webkit) against `pnpm dev` on
`localhost:3000`, at commit `6523c1c` + the TideChart type fix. These are the "before"
reference for the Phase 3 UI redesign (`docs/plans/03-UI-FOUNDATION-SPEC.md`).

| File | Route | Viewport |
|---|---|---|
| `home-desktop.png` | `/` | 1440×900 |
| `home-mobile.png` | `/` | 390×844 |
| `calculator-desktop.png` | `/calculator/` | 1440×900 — shows the blocking safety modal |
| `calculator-desktop-open.png` | `/calculator/` | 1440×900 — navigation menu open |
| `calculator-mobile.png` | `/calculator/` | 390×844 |
| `conditions-desktop.png` | `/marine-conditions/` | 1440×900 |
| `photo-desktop.png` | `/photo-correction/` | 1440×900 |

## Observations that corroborate the UI audit

- **Hamburger-only IA:** `calculator-desktop-open.png` shows all 9 tools in one flat menu.
  In-page tabs (Gas Recommendations, Gas Playground, Gas Blender, MOD Check, SAC/RMV,
  Bottom Time, Links) and cross-page redirects (Marine Conditions, Underwater Photo Editor)
  are visually identical — the user cannot tell which will reload the app. Confirms
  audit finding G and Phase 3 §3 (route-per-tool restructure).
- **Two modals compete on first paint:** the PWA "Install App" panel renders top-left at the
  same time as the navigation overlay. Confirms audit finding §4 (floating-widget crowding)
  and Phase 3 §4 (fold install into a More sheet / toast).
- **Safety modal gates the calculator** — correct behavior to preserve, but it is the only
  content visible on load, so the app's first impression is a wall of red. Phase 3 §5
  and Phase 4's acknowledgment flow should keep the gate while improving the framing.

## Health check (`webshot check /calculator/`)

Clean at baseline: no JS errors, no console errors, no failed requests, no broken images,
no horizontal overflow. This is the regression bar the redesign must hold.

## Re-capture

```bash
pnpm dev                       # terminal 1
webshot shot http://localhost:3000/calculator/ --out after.png --size 1440x900 --wait 3000
webshot sizes http://localhost:3000/calculator/   # all 6 breakpoints + overflow report
webshot check http://localhost:3000/calculator/   # exits non-zero on regressions
```
