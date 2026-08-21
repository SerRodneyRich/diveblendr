# DiveBlendr Style Guide

The single source of truth for how a page looks and behaves. Every tool page must conform.
If this document and an existing page disagree, **this document wins** — most tool
components are still un-migrated legacy and are not a model to copy.

---

## 1. The look, in one paragraph

DiveBlendr is a **column of water**. The page ground is the abyss; a raised panel is closer
to the surface, so it is *lighter and bluer*, not lighter-gray. A dimmed underwater photograph
sits behind everything, with panels floating over it as translucent glass. The identity colour
is **blue**; amber is an accent spent only on primary actions and the single most important
number on screen. It should feel like a precision instrument used underwater — calm, legible,
unfussy — not like a dashboard template.

## 2. Hard rules

1. **Never write a raw colour.** No `bg-gray-700`, `text-yellow-400`, `border-white/20`, no hex,
   no `rgba()`. Only the semantic token classes (§3). A colour with no token means you are
   inventing a visual idea — don't.
2. **Never restyle a raw element.** No `<button className=…>`, no hand-rolled `fixed inset-0`
   overlay, no bare `<input type=range>`. Compose the primitives in `@/components/ui` (§4).
3. **Never hardcode a safety threshold.** PPO₂, END, density limits come from
   `PreferencesContext` through the Phase 1 warnings module.
4. **Never do arithmetic in a component.** Import from `src/lib/`. If a calculation is missing,
   report it — do not inline it.
5. **Never hardcode units.** Use `useUnits` / `useUnitConversion`.
6. **Never regress accessibility.** The primitives carry focus management, dialog semantics,
   labels and 44px targets. You get them by composing; you lose them by hand-rolling.

## 3. Tokens

Defined in `src/app/globals.css` under `@theme`. Use via Tailwind classes
(`bg-surface-1`, `text-text-muted`, `border-border`, …).

| Group | Tokens | Use for |
|---|---|---|
| Surfaces | `abyss`, `surface-0…3` | 0 = page ground, 1 = card, 2 = input/raised, 3 = hover/active |
| Borders | `border`, `border-strong` | panel edges; `-strong` for emphasis or focus |
| Text | `text`, `text-muted`, `text-subtle`, `text-inverse` | body, secondary, labels/hints, on-accent |
| Brand | `brand`, `brand-strong`, `brand-muted` | headings, active nav, links, wordmark |
| Accent | `accent`, `accent-strong`, `accent-muted`, `on-accent` | primary action, hero value — sparingly |
| Semantic | `info`, `success`, `warning`, `danger` (+ `-bg`, `-border`) | banners, warning severities, result tones |
| Gas species | `o2`, `he`, `n2` | anything showing a gas fraction, always the same colour per gas |

**Gas colours are canonical.** O₂, He and N₂ must use their token everywhere — mix results,
blender steps, planner charts — so a diver learns the mapping once.

## 4. Primitives

`import { … } from '@/components/ui'`

`Button` · `Card` / `CardHeader` / `StatCard` · `Modal` · `Input` · `Select` · `NumberField` ·
`Slider` · `Switch` · `SegmentedControl` · `Tabs` / `TabPanel` · `Tooltip` ·
`Banner` / `BannerStack` · `Table` · `cn`

If a primitive is *almost* right: **do not fork it, do not restyle it with className hacks.**
Use the closest fit and report the gap. A second Button is how design systems die.

## 5. Page skeleton

Every tool page has the same bones. `/planner` is the reference implementation — read it first.

```
<page header>      icon + <h1> + one-line subtitle saying what the tool does
<BannerStack>      warnings, severity-ordered, always visible — never hover-only
<Card>             inputs, grouped by meaning, with CardHeader
<StatCard row>     results — the shared output vocabulary
<detail>           tables, math, secondary output
```

- **Inputs left/top, results right/below.** On desktop aim for a two-column split; on mobile
  it stacks with results reachable without hunting.
- **Results are `StatCard`s.** Label, value, unit, tone. This is what makes five different
  tools feel like one app.
- **Live recalculation.** No "Calculate" button. Debounce only if a calculation is expensive.
- **Empty state is a real state.** Before input, show em-dash placeholders and what the tool
  will tell them — not a blank panel.

## 6. Typography and numbers

- Geist Sans for prose, Geist Mono for figures. Both are already wired.
- **Every column of numbers uses tabular figures** (`tnum`) so digits align between rows.
- Units are `text-text-subtle` and smaller than the value they follow; never bold a unit.
- Headings: one `<h1>` per page. Do not skip levels.

## 7. Warnings

Severity maps to `info` / `warning` / `danger`. Order most-severe first. A warning is
**inline and persistent** — never a tooltip, never dismissible without acknowledgement, never
hidden behind an icon. If a value breaches a limit, the value itself takes the semantic tone
*and* a banner explains it.

## 8. Voice

Plain, factual, peer-to-peer. Write for a diver who knows the vocabulary but not this app.

- Good: "In development — nothing here is usable yet." · "PPO₂ 1.62 exceeds your 1.60 working limit."
- Bad: "Oops! Something went wrong 😬" · "Awesome mix!" · "Please be advised that…"

No exclamation marks. No emoji in the interface. No moralising about certification — state the
fact and let the diver decide.

## 9. Motion

Sparing and fast (≤200 ms). Transitions on hover/focus/appearance only; never animate a number
into place, never a spinner where a skeleton or an em-dash would do. Everything behind
`motion-safe:`.

## 10. Verification — required, not optional

You have `webshot` on PATH. **Do not build UI blind.**

```bash
PORT=<yours> pnpm dev
webshot shot  http://localhost:<port>/<route>/ --out after.png --size 1440x900 --wait 2500
webshot shot  http://localhost:<port>/<route>/ --out mobile.png --size 390x844  --wait 2500
webshot sizes http://localhost:<port>/<route>/     # 6 breakpoints + overflow report
webshot check http://localhost:<port>/<route>/     # errors, failed requests, overflow
```

Then **`Read` the PNGs and judge them.** Ask: does this look like the same app as `/planner`?
Does every number line up? Is anything unreadable at 390 px? A `_vercel/insights` 404 when
serving the static export locally is expected — ignore only that.

## 11. Definition of done for a page

- Renders fully at its own route inside `AppShell`; no redirect stub remains
- Zero raw colours, zero raw buttons, zero hand-rolled overlays (grep your diff)
- Its tab is removed from `src/app/(tools)/calculator/page.tsx`, other tabs still work
- `pnpm test` · `pnpm lint` · `rm -rf .next out && pnpm build` all green
- `webshot check` clean; desktop **and** mobile screenshots reviewed by you
- Anything you could not do is reported, not silently skipped
