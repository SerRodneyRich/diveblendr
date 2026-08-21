# Shared brief — parallel tool-page extraction

Read this **plus** your assigned section. Every agent working on a tool page follows this
document so the pages come out as one app rather than five different apps.

## The job

`src/app/(tools)/<tool>/page.tsx` is currently an 8-line stub that redirects into
`src/app/(tools)/calculator/page.tsx` — a 1,501-line god component that still owns every
tool's state, JSX, and logic. Your job is to move **your** tool out of it into a real page,
so it owns its own route, state, and layout.

When every tool has moved, the calculator page is deleted. Until then it must keep working:
**do not break the tabs you are not responsible for.**

## Hard boundaries (this is what makes parallel work safe)

| You own | You must NOT touch |
|---|---|
| `src/app/(tools)/<your-tool>/**` | any other tool's route directory |
| the tool components listed in your section | `src/components/ui/**` (the primitive library) |
| new files you create under `src/components/<your-tool>/` | `src/app/globals.css`, `layout.tsx`, `LayoutClient.tsx` |
| | `src/components/chrome/**`, `src/config/navigation.tsx` |
| | `src/lib/**`, `src/utils/**`, `src/data/**` (calculation code — read only) |

**`src/app/(tools)/calculator/page.tsx` is shared.** Every agent must delete their own tab
from it. Keep those edits surgical: remove your tab's JSX branch, its reducer actions, and
its now-unused imports — nothing else. Expect to re-run and fix a conflict here; that is
normal and cheap. Commit your calculator edit in the *same* commit as your page so the
two halves never diverge.

## Style guide — non-negotiable

1. **Compose primitives; never restyle raw elements.** Import from `@/components/ui`:
   `Button, Card, CardHeader, StatCard, Modal, Input, Select, NumberField, Slider, Switch,
   SegmentedControl, Tabs, TabPanel, Tooltip, Banner, BannerStack, Table, cn`.
   If you find yourself writing `<button className="...">`, stop — use `Button`.
   If a primitive is *almost* right, do not fork it: report the gap and use the closest fit.
2. **Tokens only, no raw colours.** No `bg-gray-700`, no `text-yellow-400`, no hex. Use the
   semantic token classes defined in `globals.css` (surface/text/border/accent/info/success/
   warning/danger and the gas-species tokens). If you need a colour that has no token, that is
   a signal you are inventing a new visual idea — don't.
3. **Page shape.** Every tool page follows the same skeleton, which `/planner` already
   demonstrates — copy its structure:
   - page header: icon + `<h1>` + one-line subtitle saying what the tool does
   - inputs grouped in `Card`s with `CardHeader`
   - results as `StatCard`s (label, value, unit, tone) — this is the shared output vocabulary
   - warnings as a `BannerStack` above results, severity-ordered — never hover-only tooltips
4. **Numbers are tabular.** Any column of figures uses the mono/`tnum` treatment already in
   the primitives.
5. **Live calculation.** Recalculate on input change; no "Calculate" button.
6. **Units.** Read `useUnits`/`useUnitConversion` — never hardcode metric or imperial.
7. **Preferences drive limits.** Warning thresholds come from `PreferencesContext` via the
   Phase 1 warnings module. Never hardcode 1.4 / 1.6 / 30 m / 6.2 g/L.
8. **Voice.** Plain, factual, peer-to-peer. The owner likes honest labels ("In development —
   nothing here is usable yet") over marketing. No exclamation marks, no "Oops!".

## Calculation code is read-only

Phase 1 rewrote the math into `src/lib/` with 336 passing tests. **Import it; do not
reimplement or edit it.** Notably: `src/lib/` holds pressure, gas properties, CNS, warnings,
consumption, and the blend planner. If a page needs a calculation that does not exist, do not
inline arithmetic in the component — report it and stub the display.

If you believe a calculation is wrong, **report it, do not fix it.** Changing safety math
outside the tested modules is how errors reach divers.

## Accessibility (already paid for — don't regress it)

Focus trapping, dialog semantics, live-announcement and 44px touch targets are built into the
primitives. You get them free by composing. Do not add `tabIndex`, custom key handlers, or
`aria-*` to a primitive that already manages it. Every input needs a real label.

## Definition of done

- Your route renders your tool fully, with no redirect stub left
- Your tab is gone from `calculator/page.tsx`, and the other tabs still work
- `pnpm test` green · `pnpm lint` green · `rm -rf .next out && pnpm build` green
- `webshot check http://localhost:<port>/<your-route>/` clean (no JS errors, no console
  errors, no horizontal overflow). A `_vercel/insights` 404 appears when serving the static
  export locally — ignore only that one.
- `webshot shot` at 1440x900 **and** 390x844, and you have actually looked at both

## Tooling

- `pnpm dev` — pick a port with `PORT=<n> pnpm dev` and **use your assigned port** so agents
  do not fight over 3000
- `webshot shot <url> --out f.png --size 1440x900 --wait 2500` · `webshot sizes <url>` ·
  `webshot check <url>` · `webshot eval <url> --js "expr"`
- Read your screenshots back with the `Read` tool and judge them. Do not build UI blind.

## Committing

Small checkpoints. Message says what moved and what changed behaviourally. End with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
**Never `git push`** — the owner pushes.

## Report back

What you moved, anything you had to leave behind, any primitive gap or calculation bug you
found, and the screenshot paths. Your final message is consumed as data — be complete and factual.
