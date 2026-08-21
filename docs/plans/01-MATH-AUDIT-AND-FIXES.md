# Phase 1 — Math Audit Findings & Fix Specification

**Prerequisite:** Phase 0 merged (Vitest available).
**Scope:** Fix every finding below in the existing calculators, and build the golden-value test suite. Do NOT build the deco engine here (that is Phase 2) — but structure fixes so Phase 2 can consume them.
**Line numbers** reference the 2026-08-07 audit; re-locate by content if drifted.

## Architectural rule established by this phase

All formulas live in `src/lib/` (rename/move `src/utils/` calculation modules there; keep `src/utils/` for genuinely non-math helpers). Components and pages must not contain arithmetic beyond display formatting. The calculator page's inline math (see F11) is the biggest violation.

Internal unit conventions (enforce in types + tests): pressure **bar**, depth **meters**, volume **liters**, temperature **°C at API boundary, K internally where physics needs it**, gas fractions **0–1 in new code** (existing 0–100 APIs may remain but must be documented; new `src/lib/` code uses fractions).

---

## Findings

Severity: **S1** = wrong/misleading safety-relevant output · **S2** = wrong output, credibility/accuracy · **S3** = robustness/edge case · **S4** = code health with math risk.

### F1 · S1 — Safety-limit preferences are ignored by the warning engine
`src/app/calculator/page.tsx` `generateWarnings` (~lines 298–371) hardcodes PPO₂ 1.4/1.6, END 30 m, density 6.2/7.0 g/L etc., while `PreferencesContext` exposes user-configured `maxPPO2Work`, `maxPPO2Deco`, `maxPPO2CCR`, `maxGasDensity`, `maxGasDensityCritical`, `maxEND`. The Preferences "Safety Limits" tab is therefore decorative. Similarly the best-mix generator (line ~528) hardcodes the N₂-only END model, ignoring the `includeOxygenNarcosis` preference; CCR bailout math (~line 876–901) hardcodes 1.4 bar instead of `maxPPO2Work`/`maxPPO2Deco`.
**Fix:** thread preferences into all warning/recommendation generation. When extracting the recommendation engine (F11), take preferences as an explicit parameter object so it stays pure/testable. Add tests: changing each preference changes the corresponding warning threshold.

### F2 · S1 — NOAA CNS table has wrong values and gaps
`src/lib` (was `src/utils/endModCalculations.ts`) lines 334–346. Current table gives max single-dive minutes: 1.05–1.14→150, 1.15–1.24→120, 1.25–1.34→45, 1.35–1.44→45, 1.45–1.54→45. NOAA Diving Manual (4th ed.) single-exposure limits are: PPO₂ 0.6→720, 0.7→570, 0.8→450, 0.9→360, 1.0→300, 1.1→240, 1.2→210, 1.3→180, 1.4→150, 1.5→120, 1.6→45 min. The app currently reports e.g. 30 min @ PPO₂ 1.3 as **67% CNS** instead of ~17% — wildly over-conservative, destroys credibility. Additionally the band edges leave gaps (e.g. PPO₂ 0.645 matches no band → `null`), and `Math.round` on the result loses precision.
**Fix:** replace with the exact NOAA breakpoint list above (implementing agent: verify each value against the NOAA Diving Manual before committing; cite edition in a comment). Linearly interpolate the *limit* between breakpoints so CNS% is continuous. PPO₂ < 0.5 → 0%; PPO₂ > 1.6 → return `Infinity`-semantics (a `{ percent: null, overLimit: true }` shape) so the UI shows "exceeds NOAA limits", not silence. Return one decimal, no rounding to integer. Golden tests at every breakpoint, between breakpoints, and out-of-range.

### F3 · S1 — Real-gas blender silently reports impossible blends as successful
`src/utils/realGasBlending_v3.ts`:
- `warnings` array (line 88) is **never populated** anywhere.
- If target requires *removing* gas (`nFinal ≤ n0`, line 106): returns `finalMix = target` with zero steps — reads as "already done" when the truth is "drain required".
- Required O₂/air moles are clamped `Math.max(0, …)` (lines 184–185): an over-rich current fill silently yields steps that cannot reach the target, and the final air step (lines 258–266) *forces* reported totals to the target mix, masking the infeasibility.
- Helium bisection failure falls back to `nAddHe = 0` silently (line 156–157).
**Fix:** add an explicit feasibility stage before step generation. In mole space compute required additions of each supply gas; if any is negative, compute the drain: `keepFraction = min over species(targetMoles_i / currentMoles_i)`, emit a "Drain to X bar" step (the ideal-gas path in `GasBlender.tsx` lines 152–170 already does this — reuse its logic), then re-solve. Populate `warnings` for: drain required, bisection non-convergence, unreachable purity, hypoxic result, PPO₂-at-target-depth exceedance. `finalMix` must always be the mix the steps actually produce, never assumed.

### F4 · S2 — Two parallel blending engines that can disagree
`GasBlender.tsx` (lines ~131–300) contains a complete ideal-gas blend algorithm (with drain logic) *and* calls `performRealGasBlending` (no drain logic). Divergent behavior between "ideal" and "real gas" modes is a correctness trap.
**Fix:** one module `src/lib/blending/` with a single planner that takes `{ eos: 'ideal' | 'vdw' }`. The EOS only affects moles↔pressure conversion; feasibility/drain/step logic is shared. `GasBlender.tsx` becomes UI-only. Property test: for pressures ≤ 100 bar and He ≤ 30%, ideal and vdw step pressures agree within 2%.

### F5 · S2 — Purity handling breaks mole balance and divides by zero
`realGasBlending_v3.ts` lines 208, 240: `nAddHe / (availableHe/100)` → `Infinity` when purity is 0. Worse, the extra moles from impure supplies are added to the tank total but their non-He/non-O₂ content is never attributed to any species, so composition tracking is wrong; the solver (lines 120–185) ignores purity entirely.
**Fix:** model supply gases as full mixtures (e.g. banked 32% is `{O2:0.32, N2:0.68}`) and include them in the linear solve; validate purity inputs (reject ≤ 0). The unified blender (F4) should accept arbitrary supply-gas mixtures — this also unlocks blending *with* banked nitrox/trimix, a feature paid competitors lack.

### F6 · S2 — O₂ rounding direction is anti-conservative for MOD
`src/utils/safeRounding.ts` lines 61–64 round O₂ **down** claiming this is "safer for MOD" — it is the opposite: MOD = (PPO₂/FO₂ − 1)×10, so understating FO₂ *deepens* the computed MOD. (Mostly absorbed by floor-to-whole-meter MOD rounding, but the principle and edge cases are wrong.)
**Fix:** make rounding direction context-specific, not species-specific: for MOD/toxicity purposes round FO₂ **up**; for hypoxia floor checks round FO₂ **down**; for END round narcotic fraction **up**. Provide `roundForMOD`, `roundForHypoxiaCheck`, `roundForEND` or a `direction` parameter; update the doc comments which currently teach the wrong rationale. Add tests that rounding never produces a less-conservative result than the unrounded value for each context.

### F7 · S3 — Gas density: 1.3% systematic error + magic numbers in UI
`endModCalculations.ts` lines 240–253: STP densities (defined at 1 atm = 1.01325 bar) are multiplied by absolute pressure *in bar*, overestimating density ~1.3% (conservative, but unnecessary). Calculator page hardcodes `4.69` g/L (lines ~539, 808) for a specific mix inline.
**Fix:** compute density from first principles: ρ = P·M/(R·T) with M from the molar masses already in `vanDeWaalsPhysics.ts` `GAS_CONSTANTS`. One function, used everywhere; delete inline constants. Golden test: air at 1.01325 bar, 0 °C → 1.293 g/L (±0.5%); air at 5 bar abs, 20 °C; trimix 18/45 at 70 m.

### F8 · S3 — Depth↔pressure model is fixed at 1 bar/10 m, no salinity/altitude
All modules use `(depth/10)+1`. Acceptable msw convention for the simple tools, but the Phase 2 planner needs configurable surface pressure (altitude) and water density (fresh/salt).
**Fix now:** centralize in `src/lib/pressure.ts`: `ambientPressure(depth, { surfacePressureBar = 1.01325, waterDensityKgL = 1.03 } (salt) | 1.00 (fresh) })` using P = Psurf + ρ·g·d/100000; keep a `simple: true` mode reproducing (depth/10)+1 for existing tools so their outputs don't shift in this phase. Planner (Phase 2) uses the physical mode.

### F9 · S3 — Van der Waals solver robustness
`vanDeWaalsPhysics.ts`: Newton iteration (lines 87–117) returns the last iterate with no convergence signal; `pressureFromMoles` silently switches to ideal-gas fallback **mid-blend** with a `console.warn` (lines 179–190), creating step discontinuities and violating the no-console rule.
**Fix:** return `{ value, converged }` and surface non-convergence as a blender warning; decide EOS suitability **once per blend** (via `isVanDerWaalsSuitable`) rather than per-step; remove `console.warn`. Add convergence tests: 300 bar 100% He, 300 bar 50/25/25 trimix, 1 bar air, and a deliberately pathological tiny-tank case asserting `converged: false` propagates.

### F10 · S3 — Input validation gaps
- `validatePPO2` (`endModCalculations.ts` ~line 101) hard-caps at 1.6 regardless of user's configured deco/CCR limits and treats OC and CCR identically (dead `mode` parameter).
- `validateGasMixture` accepts totals 98–102 (loose) and its NaN-coercion-to-0 can mask caller bugs.
- `getRegionalDefaults` (`unitConversions.ts` line 151) touches `navigator` unguarded — SSR/prerender hazard if ever imported server-side.
- `unitConversions.ts` has its own `safeRound` (line 19) shadowing the name of `safeRounding.ts`'s — confusing near-duplicate.
**Fix:** validation limits come from one `src/lib/limits.ts` (consumed by both validators and the preferences UI so they can't diverge); tighten mixture total to 99.5–100.5; throw on NaN rather than coerce; guard `navigator`; rename the local rounding helper.

### F11 · S4 — Calculator page embeds ~650 lines of duplicated formula + LaTeX logic
`calculator/page.tsx` lines ~285–1164: recommendation generation, warning generation, and KaTeX strings all inline, with formula variants duplicated (`END=(D+10)·N2/79−10` here vs the lib's equivalent form), magic numbers, and hardcoded example blocks.
**Fix:** extract to `src/lib/recommendations/` (pure, preferences-as-parameter, returns data + a `mathSteps` structure from which LaTeX is generated by one renderer — formulas and their displayed derivations must come from the same constants). This is also Phase 3's prerequisite for decomposing the page. Snapshot tests on the generated recommendation set for a matrix of (mode × gas type × depth × PPO₂).

### F12 · S4 — Tank data unverified
`src/data/tankSpecifications.ts` (408 lines) values are plausible (AL80 = 11.1 L @ 207 bar ✓) but unaudited.
**Fix:** verify every entry against manufacturer specs (Luxfer/Catalina/Faber/Worthington); imperial tanks: confirm the cu-ft rating is *capacity at working pressure* and that `waterVolumeL` is true water volume, not derived from the rating (classic error: AL80 is 77.4 cu ft actual, 11.1 L — already correct, use as the pattern). Add a data test asserting `waterVolumeCuFt ≈ waterVolumeL × 0.0353` and `workingPressurePSI ≈ workingPressureBar × 14.504` within 2% for every tank.

### F13 · S2 — SAC/BottomTime spot-checks (mostly sound, verify in tests)
`SacCalculator.tsx` (lines 112–124, 249–254): SAC = ΔP/(ATA·t) [bar/min], RMV = ΔP·V/(t·ATA) [L/min] — correct ideal-gas treatment; note in UI copy that high-pressure steel fills understate true volume slightly. `BottomTimeCalculator.tsx`: thirds logic `turnPressure = start·(1−usableFraction)` ✓. Both currently live in components → move math to `src/lib/consumption.ts` with tests (also required by Phase 2 gas logistics, which consumes SAC).

---

## Test suite specification

Framework: Vitest. Location: `src/lib/**/*.test.ts`. Target: every exported function; ~150+ assertions minimum across:

1. **Golden values** (hand-derived, comment the derivation): MOD(32% O₂, 1.4) = 33 m floor (33.75 raw); MOD(21%, 1.4) = 56 m; END(21/35 @ 60 m, N₂-only) ; END with O₂-narcosis model > N₂-only for same mix; density cases from F7; CNS breakpoints from F2; blend: empty tank → 18/45 @ 200 bar with pure O₂/He/air (verify vs hand partial-pressure arithmetic, ideal mode); blend requiring drain; blend from banked 32%.
2. **Property tests** (plain loops are fine): mix fractions sum to 1 after every blend step; MOD/depth round-trip monotonicity; conservative rounding never less safe than raw (per F6 contexts); ideal-vs-vdw agreement envelope (F4); all functions total (no NaN/Infinity escapes) over a randomized-but-seeded input grid.
3. **Regression pins:** current *correct* outputs of unchanged functions, so refactors (F11 extraction, F4 unification) are provably output-preserving where intended.

## Definition of done

- All findings F1–F13 fixed with tests; `pnpm test`, `pnpm lint`, clean `pnpm build` (static export, all pages prerender) green.
- No arithmetic in components/pages beyond display formatting (grep-check `Math.` and numeric literals with units in `src/components` and `src/app`).
- WhatsNewModal updated per CLAUDE.md pre-commit routine.
