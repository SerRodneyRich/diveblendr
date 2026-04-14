# DiveBlendr - Technical Diving Gas Calculator

## Overview
DiveBlendr is a comprehensive Progressive Web App (PWA) for technical diving gas mixing and Maximum Operating Depth (MOD) calculations. Built with Next.js, TypeScript, and Tailwind CSS, it provides professional-grade gas blending calculations with real-time safety analysis and warnings.

## Application Architecture

### Tech Stack
- **Framework**: Next.js 15.5.9 with React 19.1.0
- **Language**: TypeScript with strict mode enabled
- **Styling**: Tailwind CSS v4
- **PWA**: @ducanh2912/next-pwa with service worker support
- **Analytics**: Vercel Analytics + Google Analytics + GoatCounter
- **Security**: Content Security Policy headers, secure origins
- **Email**: EmailJS integration with reCAPTCHA v3 protection
- **Testing**: Playwright for E2E testing
- **Icons**: React Icons library

### Project Structure
```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout — provider chain + analytics
│   ├── page.tsx                 # Landing page
│   ├── calculator/              # Main calculator app
│   └── tank-test/               # Tank pressure testing tools
├── components/                  # React components (45+ files)
│   ├── GlobalUIComponents.tsx       # Navigation wrapper
│   ├── NavigationMenu.tsx           # Hamburger menu + PreferencesModal trigger
│   ├── DiveModeSelector.tsx         # OC/CCR mode selection
│   ├── GasTypeSelector.tsx          # Nitrox/Trimix selection
│   ├── ParameterControls.tsx        # Input controls
│   ├── AnalysisResults.tsx          # Gas analysis display (CNS%, responsive grid)
│   ├── ModCheckForm.tsx             # MOD validation
│   ├── GasBlender.tsx               # Gas mixing calculator
│   ├── SacCalculator.tsx            # Surface Air Consumption
│   ├── SafetyWarningModal.tsx       # Safety warnings
│   ├── TankSelector.tsx             # Tank picker with custom tank support
│   ├── PreferencesModal.tsx         # Tabbed diver preferences UI
│   ├── AccessibilitySettings.tsx    # Accessibility options
│   └── ui/
│       └── SliderWithInput.tsx      # Reusable slider+number-input component
├── contexts/                    # React Contexts (all localStorage-backed)
│   ├── PreferencesContext.tsx       # Diver preferences (dive mode, gas type, safety limits, custom tanks)
│   ├── UnitsContext.tsx             # Metric/imperial unit preferences
│   ├── AccessibilityContext.tsx     # Accessibility settings
│   └── FavoritesContext.tsx         # Saved dive locations
├── utils/                       # Core calculation libraries
│   ├── realGasBlending_v3.ts        # Main gas calculation engine (Van der Waals)
│   ├── endModCalculations.ts        # MOD, END, gas density, CNS% calculations
│   ├── safeRounding.ts              # Conservative rounding algorithms
│   ├── vanDeWaalsPhysics.ts         # Real gas physics calculations
│   └── preferencesBackup.ts        # Preferences export/import (JSON backup)
└── data/
    └── tankSpecifications.ts        # System dive tank specifications
```

## Core Features

### Dive Mode Support
- **Open Circuit (OC) Nitrox**: Standard recreational/technical diving
- **Open Circuit Trimix**: Deep technical diving with helium
- **Closed Circuit Rebreather (CCR)**: Rebreather diving with nitrox diluent
- **CCR Trimix**: Advanced rebreather diving with trimix diluent

### Gas Mixing Capabilities
- **Nitrox Calculations**: Optimal oxygen percentages for target depths
- **Trimix Calculations**: Balanced oxygen, helium, and nitrogen mixes
- **MOD Calculations**: Maximum Operating Depth for any gas mixture
- **END Calculations**: Equivalent Narcotic Depth analysis (N₂-only or N₂+O₂ model)
- **Gas Density Analysis**: Temperature-corrected breathing gas density calculations
- **CNS% Estimate**: Single-dive CNS oxygen toxicity estimate using NOAA table
- **Real Gas Physics**: Van der Waals equation corrections for accuracy

### Safety Systems
- **Real-time Warnings**: PPO₂ limits, gas density warnings, END limits (severity-based borders)
- **Conservative Rounding**: O₂ rounds down, He rounds up, N₂ rounds down
- **User-configurable Limits**: PPO₂ work/deco/CCR, max gas density, max END — all adjustable in Preferences
- **Visual Warning System**: Color-coded warnings with severity-based left-border (blue/yellow/red)
- **Safety Modal**: Critical safety warnings before calculator access

### Sitewide User Preferences
All preferences persist to `localStorage` and survive page reloads. Provider chain in `layout.tsx`:
`AccessibilityProvider > UnitsProvider > PreferencesProvider > FavoritesProvider`

**PreferencesContext** (`diveblendr-preferences`) stores:
- Default dive mode and gas type (loaded into calculator on mount)
- Configurable safety thresholds: `maxPPO2Work`, `maxPPO2Deco`, `maxPPO2CCR`, `maxGasDensity`, `maxGasDensityCritical`, `maxEND`
- Oxygen narcosis model toggle (IANTD/GUE N₂-only default vs NOAA/DCIEM N₂+O₂)
- Default calculation parameters: `defaultTargetMod`, `defaultDesiredPPO2`
- **Custom tanks**: user-added tank specs merged with system tanks in `TankSelector`

**PreferencesModal** (gear icon ⚙ in navigation menu) has 4 tabs:
- Dive Profile | Safety Limits | Custom Tanks | Backup / Restore

**Backup/Restore**: `src/utils/preferencesBackup.ts` exports all 4 preference namespaces (`units`, `accessibility`, `preferences`, `favorites`) to a single dated JSON file, and imports them back with per-section error handling.

### Advanced Tools
- **Gas Blender**: Calculate required partial pressure fills for target mixes
- **SAC Calculator**: Surface Air Consumption rate calculations
- **Bottom Time Calculator**: Gas consumption and dive time planning
- **Tank Pressure Testing**: Pressure testing calculations and safety factors
- **Mathematics Modal**: LaTeX-rendered equations explaining calculations

## Key Technical Implementation

### Environment Variables
All sensitive configuration is in `.env.local` (gitignored). Never hardcode API keys in source.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 |
| `NEXT_PUBLIC_GOATCOUNTER_DOMAIN` | GoatCounter analytics domain |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3 site key |
| `NEXT_PUBLIC_EMAILJS_SERVICE_ID` | EmailJS service |
| `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID` | EmailJS template |
| `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY` | EmailJS public key |
| `NEXT_PUBLIC_EMAILJS_RECIPIENT` | Contact form recipient |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | Stripe donation link |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `GOATCOUNTER_API_KEY` | GoatCounter API key |

See `.env.example` for a full template with setup instructions.

### SSR Safety Rules
- **All modals that use `localStorage` or browser APIs must be loaded with `dynamic(..., { ssr: false })`** to avoid prerender failures. This applies to `PreferencesModal` and any future components that use `preferencesBackup.ts`.
- Contexts use `if (typeof window !== 'undefined')` guards in all `useEffect` hooks.

### TankSelector
`TankSelector` merges system tanks from `tankSpecifications.ts` with `preferences.customTanks`. Custom tanks are prepended and bypass region filtering. Every usage site gets a "⚙ Manage" button in the label row that opens `PreferencesModal` on the Custom Tanks tab.

### Calculation Engine
Core gas mixing in `src/utils/realGasBlending_v3.ts` and `src/utils/endModCalculations.ts`:
- Real gas physics corrections using Van der Waals equations
- Conservative rounding algorithms for safety
- `calculateGasDensity(mixture, depth, waterTempC?)` — temperature-corrected (default 20°C)
- `calculateEND(mixture, depth, includeOxygenNarcosis?)` — IANTD/GUE default, NOAA/DCIEM optional
- `calculateCNSPercent(ppo2, diveTimeMinutes)` — NOAA O₂ exposure table lookup

### PWA Features
- **Service Worker**: Offline functionality with workbox
- **Install Prompts**: Smart browser-specific install prompts
- **Offline Support**: Core calculations work without internet

### Security & Performance
- **CSP Headers**: Comprehensive Content Security Policy
- **Static Export**: Pre-rendered for optimal performance (`output: export`)
- **Font Optimization**: Preloaded Google Fonts with fallbacks
- **Rate Limiting**: reCAPTCHA protection on contact forms

## Development Commands

```bash
npm install          # Install dependencies
npm run dev         # Development server (localhost:3000)
npm run build       # Production build with static export
npm run start       # Preview production build
npm run lint        # ESLint code quality checks
```

**Clean build** (when stale cache causes issues):
```bash
rm -rf .next && npm run build
```

## Pre-Commit Checklist for Claude

**IMPORTANT**: Before any commit, Claude must execute this pre-commit routine:

### 1. **Build Check & Fix**
```bash
rm -rf .next && npm run build
```
- Always do a **clean build** (remove `.next` first) before committing to catch stale cache issues
- Fix any TypeScript errors or build failures
- Ensure all imports and dependencies are correct
- Verify static export completes successfully (all 9 pages must prerender)

### 2. **ESLint Check & Fix**
```bash
npm run lint
npm run lint -- --fix  # Auto-fix where possible
```
- Fix all ESLint errors and warnings
- Manually fix any issues that can't be auto-fixed

### 3. **Update What's New Component**
- **Add current work as "Newest Update"** at the top of `WhatsNewModal.tsx`
- Create a temporary entry above existing commits:

```typescript
const recentCommits: Commit[] = [
  // Add this entry FIRST before any commit
  {
    hash: 'pending',
    date: new Date().toISOString(),
    author: 'Claude Code Assistant',
    title: '[Current Work Title]',
    description: '[Detailed description of current changes being committed]',
    type: 'feature' | 'fix' | 'enhancement' | 'security' | 'performance',
    files: ['[key files changed]'],
    impact: 'major' | 'minor' | 'patch'
  },
  // Existing commits follow...
```

### 4. **Pre-Commit Verification**
- [ ] Clean build (`rm -rf .next && npm run build`) completes successfully — all pages prerender
- [ ] ESLint passes all checks
- [ ] What's New updated with current work
- [ ] No new hardcoded API keys or secrets in source files
- [ ] Any new components using browser APIs loaded with `dynamic(..., { ssr: false })`
- [ ] All file changes are intentional and documented
- [ ] No debug code or console.logs left in production code

### 5. **Post-Commit Update**
After the user commits, update the "pending" entry with:
- Real git commit hash
- Actual commit timestamp
- Final commit message if different

## Deployment
- **Platform**: Vercel with automatic deployments
- **Export**: Static site generation (`output: export`) for optimal performance
- **Environment**: All env vars set in Vercel dashboard — matches `.env.local` keys
- **PWA**: Service worker caching for offline functionality
- **CDN**: Global distribution with edge caching

## What's New Component Maintenance

### WhatsNewModal Component
Located at `/src/components/WhatsNewModal.tsx`, this component displays recent commits and new features. **IMPORTANT**: Update this component whenever significant commits are made.

#### Updating Process:
1. **After each significant commit or feature release**, update the `recentCommits` array in `WhatsNewModal.tsx`
2. **Use git log commands** to get commit details:
   ```bash
   git log --pretty=format:"%h - %an, %ar : %s" -10
   git show --stat <commit-hash>
   ```
3. **Add new commits** to the top of the array with:
   - **hash**: Git commit hash (short)
   - **date**: ISO 8601 format with timezone (e.g., `2025-09-14T18:16:16+08:00`)
   - **author**: Author name or "Claude Code Assistant" for AI contributions
   - **title**: User-friendly title. Escape apostrophes with `&apos;`.
   - **description**: Detailed explanation. Escape apostrophes with `&apos;`.
   - **type**: `'feature' | 'fix' | 'enhancement' | 'security' | 'performance'`
   - **files**: Array of key files changed
   - **impact**: `'major' | 'minor' | 'patch'`

#### Timezone Handling:
- **Use full ISO timestamps** with timezone offset for accurate global display
- **JavaScript automatically converts** to user's local timezone
- **Shows "Recently"** for commits within 12 hours in the future (timezone edge case)

#### Maintenance Schedule:
- **After major commits or new features**: always update
- **Keep last 10-15 commits** for relevant history

## Safety Notice
This application is designed for educational and planning purposes. All calculations should be verified with certified dive planning software before use in actual diving operations. Technical diving requires proper training and certification.
