# DiveBlendr

**A professional-grade technical diving gas calculator — open source, offline-capable, and built by a technical diver.**

[![Live App](https://img.shields.io/badge/Live%20App-diveblendr.com-blue?style=flat-square)](https://diveblendr.com)
[![License](https://img.shields.io/github/license/SerRodneyRich/Diveblendr?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/SerRodneyRich/Diveblendr?style=flat-square)](https://github.com/SerRodneyRich/Diveblendr/issues)
[![Discussions](https://img.shields.io/github/discussions/SerRodneyRich/Diveblendr?style=flat-square)](https://github.com/SerRodneyRich/Diveblendr/discussions)

---

## What is DiveBlendr?

DiveBlendr is a [Progressive Web App](https://diveblendr.com) for planning technical dives. It handles gas mixing, MOD/END calculations, gas density warnings, and CNS% estimation — all running locally in your browser with no server required. Install it on your phone and use it offline at the dive site.

Built by a JJ-CCR / TDI MOD 2 technical diver who wanted transparent, community-verifiable tools. Every calculation is open source — if the math is wrong, you can fix it.

---

## Features

### Gas Calculations
- **MOD (Maximum Operating Depth)** — for any gas mix at any PPO₂ limit
- **Trimix blending** — partial pressure fills for O₂/He/N₂ mixes
- **Nitrox blending** — optimal oxygen percentage for target depth
- **END (Equivalent Narcotic Depth)** — N₂-only (IANTD/GUE) or N₂+O₂ (NOAA/DCIEM) models
- **Gas density analysis** — temperature-corrected, with Mitchell & Vrijdag warning thresholds
- **CNS% estimate** — single-dive oxygen toxicity using NOAA exposure table

### Dive Mode Support
- Open Circuit Nitrox
- Open Circuit Trimix
- CCR (Closed Circuit Rebreather) Nitrox diluent
- CCR Trimix diluent

### Planning Tools
- **SAC Calculator** — Surface Air Consumption rate
- **Bottom Time Calculator** — gas consumption and dive time planning
- **Tank Pressure Testing** — pressure testing and safety factors
- **Marine Conditions** — tides, current, and visibility for dive sites

### Safety
- Real gas physics via Van der Waals equations (not ideal gas approximations)
- Conservative rounding: O₂ rounds down, He rounds up, N₂ rounds down
- User-configurable PPO₂ and gas density limits
- Severity-based visual warnings (blue / yellow / red)

### PWA
- Installable on iOS, Android, macOS, and Windows
- Fully offline after first load — all calculations work with no internet

---

## Live Demo

**[diveblendr.com](https://diveblendr.com)**

No account, no signup, no data sent to any server.

---

## Quick Start (Local Development)

```bash
git clone https://github.com/SerRodneyRich/Diveblendr.git
cd Diveblendr
npm install
cp .env.example .env.local   # optional — see note below
npm run dev
# Open http://localhost:3000
```

**All gas calculations work without any API keys.** The `.env.local` keys are
only needed for analytics, contact form, and PWA push features. For calculation
work, skip `.env.local` entirely.

### Build

```bash
npm run build    # production static export
npm run lint     # ESLint checks
```

Clean build (when stale cache causes issues):
```bash
rm -rf .next && npm run build
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, `output: export`) |
| Language | TypeScript — strict mode, no `any` in calc code |
| Styling | Tailwind CSS v4 |
| Runtime | React 19 |
| PWA | @ducanh2912/next-pwa |
| Testing | Playwright (E2E) |
| Deployment | Vercel (static CDN) |

The app is a fully static export — no server-side rendering, no API routes at runtime.
It can be hosted on any CDN or served from a file system.

---

## Calculation Standards

These rules are non-negotiable and must be preserved in all contributions:

### Conservative Rounding

| Value | Direction | Reason |
|-------|-----------|--------|
| O₂ fraction | Round **down** | Prevents false safety margin at depth |
| He fraction | Round **up** | Ensures minimum narcotic protection |
| N₂ fraction | Round **down** | Conservative by design |

Implemented in `src/utils/safeRounding.ts`.

### PPO₂ Defaults

| Mode | Default | Source |
|------|---------|--------|
| OC working | 1.4 ATA | NOAA / TDI |
| OC deco | 1.6 ATA | NOAA / TDI |
| CCR setpoint | 1.3 ATA | TDI MOD 2 |

### Gas Density Thresholds

- Warning: **5.7 g/L** — Mitchell & Vrijdag (2016)
- Critical: **6.2 g/L** — DAN research

All gas mixing calculations use Van der Waals real gas corrections.
Ideal gas approximations are not acceptable for blending at pressure.

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── calculator/         # Main gas calculator
│   ├── marine-conditions/  # Dive site conditions
│   ├── bottom-time/        # Gas planning
│   ├── photo-correction/   # Underwater photo tools
│   └── tank-test/          # Pressure testing
├── components/             # React components (45+)
├── contexts/               # localStorage-backed React Contexts
│   ├── PreferencesContext  # Dive mode, safety limits, custom tanks
│   ├── UnitsContext        # Metric / imperial
│   ├── AccessibilityContext
│   └── FavoritesContext    # Saved locations
└── utils/                  # Core calculation libraries
    ├── realGasBlending_v3  # Gas mixing engine (Van der Waals)
    ├── endModCalculations  # MOD, END, gas density, CNS%
    ├── safeRounding        # Conservative rounding
    └── vanDeWaalsPhysics   # Real gas physics
```

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide.

The short version:

1. **Report a bug** — open an [Issue](https://github.com/SerRodneyRich/Diveblendr/issues) with the exact gas mix, depth, and what you expected vs. what DiveBlendr calculated
2. **Fix something** — fork, branch, change, PR. Calculation changes must cite a diving standard (NOAA, TDI, IANTD, PADI, GUE)
3. **Propose a feature** — use [Discussions](https://github.com/SerRodneyRich/Diveblendr/discussions) before writing code

### Areas that need help

- MOD 3+ trimix (beyond 100 m) — the author's cert level is MOD 2
- Decompression algorithm integration (VPM-B, Bühlmann)
- E2E test coverage (Playwright is set up, tests are sparse)
- Metric/imperial edge cases

---

## Safety Disclaimer

DiveBlendr is a planning and educational tool. **All calculations must be verified with certified dive planning software and your instructor before use in actual diving operations.** Technical diving requires proper training and certification. The authors accept no responsibility for decisions made based on these calculations.

Gas calculation PRs are reviewed against NOAA, TDI, IANTD, and PADI standards before merging.

---

## License

[MIT](LICENSE) — free to use, fork, and build on.

---

*Built by a technical diver, for technical divers. The math is open — if you see something wrong, fix it.*
