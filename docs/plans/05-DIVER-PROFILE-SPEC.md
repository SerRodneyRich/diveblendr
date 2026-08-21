# Phase 5 — Diver Profile & Certification-Aware Guidance

**Prerequisites:** Phase 3 (preferences UI foundations); UI surfaces in Phase 4 consume this — build the data layer any time after Phase 3, wire gating after Phase 4.
**Principle (owner decision, 2026-08-07):** the profile **informs and warns — it never locks features**. A diver planning beyond their profile gets a distinct acknowledgment flow, not a wall. All data is local (localStorage + backup file); no accounts, no telemetry.

## 1. Data model (`src/lib/profile/types.ts`)

```ts
interface DiverProfile {
  schemaVersion: 1
  displayName?: string                    // local nicety only
  certifications: Certification[]         // multiple agencies/levels allowed
  experience: { totalDives?: number; deepestDiveM?: number; trimixDives?: number; ccrHoursOnUnit?: number }
  ccrUnits?: string[]                     // e.g. "JJ-CCR", free text + suggestions
  derivedLimits: ProfileLimits            // computed from certs, user-overridable
  overrides?: Partial<ProfileLimits>      // explicit user overrides win, flagged in UI
}
interface Certification { agency: Agency | string; level: string; certId?: never }  // never store cert numbers
interface ProfileLimits {
  maxDepthM: number
  decoAllowed: boolean
  maxPPO2Work: number; maxPPO2Deco: number
  gasesAllowed: ('air'|'nitrox'|'normoxic-trimix'|'hypoxic-trimix'|'o2-deco')[]
  ccrAllowed: boolean; ccrMode?: 'mod1'|'mod2'|'mod3'
  soloConsidered?: boolean
}
```

## 2. Certification presets (`src/lib/profile/certPresets.ts`)

A data table mapping common cert levels → default `ProfileLimits`. Cover at minimum: PADI/SSI OW (18 m, no deco, air/nitrox), AOW/Deep (30/40 m), TDI/IANTD/RAID Advanced Nitrox (40 m, O₂ deco), Deco Procedures (45 m, deco), Normoxic Trimix / GUE T1 (60 m), Hypoxic/Full Trimix / T2 (100 m), CCR Mod1/2/3 (40/60/100 m), GUE Fundamentals/T1/T2, cave levels only as depth-neutral flags. Multiple certs merge by **most-permissive-per-field**. Presets are conservative-of-typical agency standards; comment each row with the agency standard it reflects (implementing agent: verify against current published agency standards, cite them). This table is data — community PRs can refine it; note that in CONTRIBUTING.

## 3. Storage & migration

- Extend `PreferencesContext` state with `profile: DiverProfile` under the existing `diveblendr-preferences` localStorage key (bump preferences schema; write migration: existing users get `profile: undefined` = "not set", no behavior change until they opt in).
- Include in `preferencesBackup.ts` export/import (it already handles namespaces + per-section errors).
- The existing safety-limit preferences (`maxPPO2Work` etc.) become the **effective limits** resolver's fallback: `effectiveLimits = overrides ?? derivedLimits(certs) ?? legacy preference values ?? app defaults`. One resolver function, unit-tested, used by warnings engine (Phase 1 F1 threading) and planner gating.

## 4. UI

- **Preferences → new "Diver Profile" tab** (first tab): cert picker (agency → level, multi-add, chips), experience fields, derived-limits preview ("Based on your certs: 45 m, deco yes, trimix no") with per-field override affordance clearly marked "manual override".
- **First-run planner nudge:** if no profile when opening `/planner`, one-time dismissible card: "Set up your diver profile for tailored safety warnings" (skippable forever — profile is optional).
- **Gating surfaces (Phase 4 wiring):** when a plan exceeds effective limits (depth, deco where !decoAllowed, hypoxic trimix where not allowed, CCR where !ccrAllowed, PPO₂ over profile), show the "beyond your profile" banner listing specific exceedances; require one explicit "I understand — planning beyond my profile" acknowledgment per plan; acknowledged state stored on the plan (so shared plans carry the flag). Mix/blender tools show a softer inline note, no acknowledgment.
- Tone guidance for all copy: peer-to-peer, factual, zero moralizing ("This plan includes staged decompression; your profile doesn't list a deco cert" — not "You are not qualified").

## 5. Tests
- Preset merge logic (multi-cert most-permissive), resolver precedence chain, migration from current preferences schema, gating trigger matrix (each limit type × exceed/comply), backup round-trip with profile present/absent.

## Definition of done
- Profile optional end-to-end (app fully functional with none); no hard locks anywhere (grep for `disabled` tied to profile — must be zero); acknowledgments persist per plan; backup round-trips; `pnpm test/lint/build` green; WhatsNewModal updated.
