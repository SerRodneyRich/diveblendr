# Phase 2 — Decompression Engine Specification (`src/lib/deco/`)

**Prerequisite:** Phase 1 merged (pressure model, limits module, test harness, unit conventions).
**License context:** Port from **DecoTengu** (GPL-3.0, compatible). Do **not** copy from Subsurface (GPL-2.0-only, incompatible) — use it only as a validation oracle. Attribute per `00-ROADMAP.md`.

## Deliverable

A pure-TypeScript, framework-free, deterministic decompression engine implementing Bühlmann ZH-L16C with Erik Baker gradient factors, plus oxygen exposure tracking, ICD checks, CCR mode, repetitive dives, and gas logistics. No React, no Date/now, no randomness, no console output. Every module unit-tested; the whole validated against the matrix in §9.

## Porting source

Primary: DecoTengu (https://github.com/... `decotengu` package; docs at https://wrobell.dcmod.org/decotengu/). Port these concepts/files:
- `decotengu/model.py` — `ZH_L16B_GF` / `ZH_L16C_GF` classes: **take the ZH-L16C compartment constants (N₂ and He half-times, a/b coefficients) verbatim from here**; do not transcribe them from memory or secondary blogs. Cross-check against a second authority (Bühlmann *Tauchmedizin* tables or Subsurface's documented tables — reading/checking numbers is fine) and record both sources in a comment. Constants are data, but treat them as safety-critical: a dedicated test pins every coefficient.
- Schreiner equation implementation, gradient-factor ceiling logic, ascent/first-stop finding.
DecoTengu is Python; this is a **port, not a transliteration** — idiomatic TS, but keep variable naming close enough that a reviewer can diff against origin. Each ported file header: `Ported from DecoTengu (GPL-3.0) — <origin file>. Copyright original authors; TypeScript port for DiveBlendr.`

Mathematical authority for review: Erik Baker, "Understanding M-values" and the gradient factor papers. Where DecoTengu and Baker's exposition differ in presentation, the implementation follows DecoTengu (it is the tested artifact) and the discrepancy is documented.

## Module layout

```
src/lib/deco/
├── types.ts          # Segment, GasMix, TissueState, Plan, Schedule, EngineOptions…
├── constants.ts      # ZH-L16C table, water vapor pressure, default rates
├── tissue.ts         # Schreiner/instantaneous loading; 16 compartments × (N2, He)
├── buhlmann.ts       # M-values, GF interpolation, ceiling computation
├── schedule.ts       # profile → full deco schedule (stops, TTS, runtime)
├── oxygen.ts         # CNS% (NOAA, from Phase 1 module) integrated over profile + OTU
├── icd.ts            # isobaric counterdiffusion checks at gas switches
├── ccr.ts            # setpoint → inspired inert pressures; bailout replanning
├── repetitive.ts     # surface interval processing, tissue carryover, plan chaining
├── logistics.ts      # per-segment gas volumes, min gas, turn pressure, lost-gas replan
└── index.ts          # public API
```

## Core algorithm requirements

### 1. Tissue model (`tissue.ts`)
- 16 compartments, each tracking N₂ and He tensions (bar). State is a plain serializable object (needed by `repetitive.ts` and UI persistence).
- Inspired inert pressure: `Pi = (Pamb − PH2O) · Fgas`, water vapor `PH2O = 0.0627 bar` (Bühlmann convention — confirm value matches DecoTengu; pin in constants with citation).
- Constant-depth exposure: instantaneous (Haldane) equation. Depth ramps (descent/ascent at constant rate): **Schreiner equation** — analytic, so no numeric integration error: `P(t) = Palv + R(t − 1/k) − (Palv − P0 − R/k)e^(−kt)` with `k = ln2/halfTime`, `R = rate-of-change of inspired pressure`. All profile segments are constant-depth or constant-rate ramps.
- Initial state: saturated on air at surface pressure (configurable surface pressure for altitude; default sea level).

### 2. Ceilings and gradient factors (`buhlmann.ts`)
- Per-compartment tolerated ambient pressure with combined-gas a/b: `a = (aN2·PN2 + aHe·PHe)/(PN2+PHe)`, same for b (DecoTengu/Baker method).
- GF model: GF_low applies at the **first (deepest) stop**, GF_high at the surface, linear interpolation in between (by depth). First-stop determination: deepest 3 m multiple at/below the GF_low-limited ceiling. Expose `gfNow(depth)` for UI display.
- Configurable GF presets: conservative 30/70 (default), moderate 40/85, aggressive 50/90, custom — stored in preferences.

### 3. Schedule generation (`schedule.ts`)
Input: ordered bottom segments `{depth, duration, gas}` (multi-level), gas list with roles (bottom/travel/deco) and switch depths (default: deco gas MOD at its configured PPO₂, rounded to standard stops), options `{descentRate=18 m/min, ascentRate=9 m/min, lastStopDepth=3|6 m, stopIncrement=3 m, minStopTime=1 min, gasSwitchExtraTime=0|n min, surfacePressure, salinity}`.
Output: full runtime table: every segment (descent, bottom, ascent legs, stops, switches) with start/end time, depth, gas, plus TTS at each point, total runtime, and per-segment engine telemetry (leading compartment, GF%, ceiling) for UI charts.
Algorithm (DecoTengu approach): simulate descent+bottom → find first stop (ascend in increments checking ceiling) → at each stop, iterate minutes until next stop depth is clear under interpolated GF → proceed; switch gas at configured depths (switch = segment at stop with new gas). Stops in whole minutes (last stop may be longer per `lastStopDepth`). NDL mode: if no stop required, report NDL remaining at bottom gas via binary search on bottom time.
**Determinism:** integer minute loop, no floating-time accumulation drift — track time in seconds as integers.

### 4. Oxygen exposure (`oxygen.ts`)
- CNS%: integrate over every segment using the Phase 1 NOAA limit function (interpolated); ramp segments use the segment's average PPO₂ (document the approximation; segments are short). Surface interval decay for repetitive dives: 90-min half-time.
- OTU (Repex/Hamilton): `OTU = t · ((PPO₂ − 0.5)/0.5)^0.83` per segment (PPO₂ > 0.5 only); accumulate per dive and per day. Warn at 300 OTU/day single-day (configurable; cite Repex in comment, verify exponent/thresholds against NOAA manual during implementation).
- Output both to the schedule summary and per-segment for charting.

### 5. ICD — isobaric counterdiffusion (`icd.ts`)
At every gas switch in a schedule, evaluate the "rule of fifths": flag when `ΔFN2 (increase) > ΔFHe (decrease)/5`. Severity: warning at >1/5, strong warning at >1/3. Also flag any switch that raises N₂ fraction while He remains in the leading compartments beyond a threshold tissue tension. Report per-switch: ΔFHe, ΔFN2, ratio, verdict, and a suggested compliant deco mix (max N₂ increase = ΔFHe/5). This is a *screening heuristic*, not a model — label it as such in output types; cite Doolette & Mitchell (2003) inner-ear DCS work in comments. The check must run automatically on every generated schedule (OC and CCR bailout).

### 6. CCR (`ccr.ts`)
- Loop model: inspired PPO₂ = setpoint (clamped: cannot exceed Pamb, cannot be below diluent-flush PPO₂ floor); inert inspired pressure = `Pamb − PH2O − setpoint`, split He:N₂ by diluent inert ratio. Tissue loading uses these inspired pressures directly (setpoint-clamped at shallow depths where setpoint > Pamb − PH2O).
- Setpoint schedule: configurable {bottom: 1.2/1.3, deco: 1.4–1.6, low/descent: 0.7} with switch depths.
- **Bailout planning:** for a chosen bailout point (default: end of bottom time — worst case; also allow "any point" sweep), take the CCR tissue state, replan the ascent open-circuit on the bailout gas list, and produce a separate OC schedule + gas volumes (via `logistics.ts`, with elevated bailout SAC default 20 L/min? — parameterized, default documented). Planner UI shows both loop schedule and bailout schedule.

### 7. Repetitive dives (`repetitive.ts`)
- `applySurfaceInterval(state, minutes, {gas=air, surfacePressure})` — continue tissue kinetics at surface. Chain plans: dive 2 starts from dive 1's post-surface-interval state. CNS decays (90-min half-time); OTU accumulates per day.
- Serialize/deserialize tissue state (versioned JSON) so the UI can persist a day's plan chain.

### 8. Gas logistics (`logistics.ts`)
- Per-gas volume: Σ over segments `SAC · Pamb(depth) · minutes` (SAC configurable per phase: bottom/deco/bailout-stress). Convert to required tank pressure via tank size (+ optional vdw correction at >200 bar).
- **Min gas / rock bottom** (OC): gas for two divers to resolve a problem and ascend from max depth: `minGas = SACcombined · [tSolve · Pbottom + ascent integral (Schreiner-free — just Pavg per leg incl. required stops on bottom gas)]`, defaults: tSolve = 1 min, SACcombined = 40 L/min (2 × 20), all parameterized.
- **Turn pressure:** thirds/halves/sixths presets + custom usable-fraction, on top of min-gas reserve; reuse/replace `BottomTimeCalculator` logic (Phase 1 moved it to `src/lib/consumption.ts` — merge here, keep one source).
- **Lost-gas contingency:** for each deco gas, generate the schedule *without* it (remaining gases only) and report added runtime + required back-gas volume. This is a first-class planner output, not an afterthought.

## 9. Validation matrix (the credibility gate)

Create `src/lib/deco/validation/golden.json` + a test that runs the engine against it. Populate expected values by running **Subsurface** (planner, ZH-L16C+GF, same rates/salinity/last-stop settings) and **DecoTengu** itself on identical inputs. Document exact Subsurface version + settings in the JSON. Tolerances: each stop ±1 min, total runtime ±5% vs Subsurface; vs DecoTengu: stops exact (same algorithm lineage).

Minimum cases:
1. 30 m / 25 min, air, GF 100/100 → near-NDL sanity.
2. 40 m / 20 min, air bottom, EAN50 deco, GF 40/85.
3. 45 m / 25 min, 21/35, deco EAN50 + O₂, GF 30/70.
4. 60 m / 20 min, 18/45, travel/deco 50%, O₂, GF 30/70.
5. 75 m / 20 min, 15/55, travel 21/35, deco EAN50 + O₂, GF 30/70 (ICD flags expected on 15/55→EAN50 — assert the flag fires).
6. Multi-level: 40 m/15 min + 25 m/15 min, EAN32, GF 40/85.
7. CCR 60 m / 30 min, setpoint 1.3, diluent 18/45, deco setpoint 1.5 + full bailout schedule (18/45, EAN50, O₂).
8. Repetitive: case 2 twice with 60 min SI — dive 2 runtime must exceed dive 1's.
9. Altitude: case 1 at 0.9 bar surface pressure — first stop/NDL shifts conservative.
10. Fresh vs salt: case 3 both — salt deeper pressures, longer schedule.

Also pin: full ZH-L16C constant table test; Schreiner vs 1-second Euler integration agreement (<0.1% after 30 min descent-and-hold — guards the analytic implementation).

## Public API sketch

```ts
planDive(plan: DivePlanInput, opts: EngineOptions): DecoSchedule       // OC & CCR
applySurfaceInterval(state: TissueState, min: number, o?): TissueState
planRepetitive(dives: DivePlanInput[], intervals: number[], opts): DecoSchedule[]
bailoutSchedules(plan, opts): BailoutReport
lostGasSchedules(plan, opts): LostGasReport
gasRequirements(schedule, sacProfile, tanks): LogisticsReport
```
All inputs/outputs serializable JSON. Version the schema (`schemaVersion`) — plans will be stored and shared (Phase 4).

## Definition of done
- All modules implemented + unit tests; validation matrix green with documented Subsurface settings; constants pinned; ICD flags asserted; `pnpm test/lint/build` green; NOTICE.md and file headers carry DecoTengu attribution; WhatsNewModal updated. **No UI in this phase** (a bare debug page behind `/planner-dev` is acceptable but not required).
