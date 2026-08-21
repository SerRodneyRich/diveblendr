# Contributing to DiveBlendr

Thank you for your interest in contributing. DiveBlendr is a technical diving tool where calculation accuracy directly affects diver safety — please read this guide before submitting changes.

## Before You Start

- Check the [Issues tab](https://github.com/SerRodneyRich/Diveblendr/issues) for existing reports of your bug or idea
- For large changes, open an issue first to discuss the approach before writing code
- All gas calculation changes **must** cite accepted diving standards (NOAA, TDI, IANTD, PADI, GUE) or peer-reviewed physics

## Getting Set Up

```bash
git clone https://github.com/SerRodneyRich/Diveblendr.git
cd Diveblendr
pnpm install
cp .env.example .env.local   # optional — every variable can be left blank
pnpm dev                     # http://localhost:3000
```

This project uses **pnpm**. If you don't have it: `npm install -g pnpm`.

The app is fully functional without any API keys — every environment variable is optional and configures analytics or search-engine verification only. If you are working on calculations, you need none of them.

## Submitting a Pull Request

1. Fork the repo and create a branch: `git checkout -b fix/end-calculation-typo`
2. Make your changes
3. Run the checks:
   ```bash
   pnpm lint
   pnpm test                       # calculation changes MUST come with tests
   rm -rf .next out && pnpm build  # static export must complete
   ```
4. Commit with a clear message: `fix: correct END calculation for O2-narcotic model`
5. Push and open a PR — describe **what** you changed and **why**

## Calculation Standards — Non-Negotiable Rules

These rules exist to prevent incorrect mixes reaching real divers.

### Conservative Rounding (MUST be preserved)
| Value | Direction | Reason |
|-------|-----------|--------|
| O₂ fraction | Round **down** | Prevents false sense of safety at depth |
| He fraction | Round **up** | Ensures minimum narcotic depth requirement |
| N₂ fraction | Round **down** | Conservative by design |

Implemented in `src/utils/safeRounding.ts`. Do not change rounding direction without a specific cited standard.

### PPO₂ Defaults
| Mode | Default | Source |
|------|---------|--------|
| OC working | 1.4 ATA | NOAA / TDI |
| OC deco | 1.6 ATA | NOAA / TDI |
| CCR setpoint | 1.3 ATA | TDI MOD 2 |

These are configurable in user preferences but the defaults must match the above.

### Gas Density Limits
- Warning threshold: **5.7 g/L** (caution)
- Critical threshold: **6.2 g/L** (STOP recommendation)
- Source: Mitchell & Vrijdag (2016), DAN research

### END Model
- Default: **N₂-only** (IANTD/GUE standard) — oxygen is not narcotic
- Optional: **N₂+O₂** (NOAA/DCIEM) — oxygen counted as narcotic
- Both models are valid; the toggle exists because agencies differ

### Real Gas Physics
Core calculations use Van der Waals corrections (`src/utils/vanDeWaalsPhysics.ts`). Ideal gas approximations are not acceptable for blending calculations at pressure.

## What Makes a Good Issue

**Bug report:**
- Exact gas mix (e.g., 21% O₂ / 35% He / 44% N₂)
- Target depth
- What DiveBlendr calculated vs. what you expected
- Reference: what standard or textbook gives the correct answer

**Feature request:**
- What problem does this solve for a diver?
- Which certification agencies endorse this calculation?
- Is there an existing tool that implements it you can reference?

## Areas That Need Help

- MOD 3+ trimix calculations (beyond 100m) — the current developer's cert level is MOD 2
- Decompression algorithm integration (VPM-B, Bühlmann) — complex, needs expert review
- Metric/imperial unit conversions — some edge cases may need polish
- Accessibility improvements
- E2E tests (Playwright setup exists in `playwright.config.ts`)

## What Not to Submit

- UI-only changes without functional improvement (color tweaks, layout reshuffles)
- New dependencies without discussion — bundle size matters for the PWA
- Changes to conservative rounding direction without a diving agency citation
- Anything that would require a subscription or account to use

## Tech Stack Quick Reference

- **Next.js 15.5.15** with App Router and `output: export` (static site)
- **TypeScript** strict mode — no `any` types in calculation code
- **Tailwind CSS v4**
- **React 19**

The app must remain a fully static export. No server-side rendering, no API routes that run at request time.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
