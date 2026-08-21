# Phase 4 — Dive Planner UI Specification (`/planner`)

**Prerequisites:** Phase 2 (engine) + Phase 3 (foundation) merged.
**Positioning:** This is the flagship. It must beat every $5 app *and* hold its own against Subsurface's planner while being radically easier to use and fully offline on a phone.

## Layout

**Desktop (≥ lg): three-zone workspace**
1. **Left — Plan input** (scrollable column): dive mode (OC/CCR via `SegmentedControl`), profile segment table (multi-level: depth/duration rows, add/remove/reorder), gas list (role-tagged: bottom/travel/deco; CCR: diluent + setpoint schedule + bailout gases), settings accordion (GF preset/custom, salinity, surface pressure/altitude, ascent/descent rates, last stop 3/6 m, SAC bottom/deco/stress).
2. **Center — Results**: profile chart (depth vs runtime; ceiling overlay; gas-switch markers colored by gas-species tokens; stop annotations) rendered with the installed chart.js 4 + react-chartjs-2; below it the **runtime table** (`ui/Table`, mono numerals): segment, depth, duration, runtime, gas, PPO₂, END, density, GF% — printable.
3. **Right — Summary rail** (`StatCard` stack): total runtime, TTS from bottom, deco time, CNS% / OTU, max END, max density, per-gas volumes + required pressure per selected tank, min gas, turn pressure. Warnings `Banner` stack pinned on top (severity-ordered; every engine warning surfaces here — ICD flags, PPO₂/density/END exceedances vs *diver-profile-aware* limits, lost-gas gaps).

**Mobile:** stacked with a sticky bottom summary bar (runtime · TTS · deco · CNS%) that expands to the full summary sheet; input and results as swipeable/`Tabs` sections. All controls thumb-reachable; segment table rows edit via bottom sheet.

## Interaction requirements

- **Live recalculation** on every input change (engine is pure + fast; debounce 150 ms). Never a "Calculate" button.
- **Contingency drawer:** tabs for Bailout (CCR — loop plan vs bailout plan side-by-side with the bailout schedule + volumes) and Lost gas (per-deco-gas loss scenarios: added runtime, required back-gas). One tap from the summary rail.
- **Repetitive chain:** plan list UI — "Add repetitive dive" appends a dive with a surface-interval field; tissue state carries over (engine `planRepetitive`); chain summary shows residual loading (16-compartment bar heatmap, He/N₂ stacked, gas-species colors) at each dive start.
- **What-if scrubbing:** dragging bottom-time or depth slider updates chart in real time — this is the feature that makes it feel a generation ahead of table-based apps.
- **Show the math:** per-value KaTeX derivation modals (existing MathModal pattern) for MOD/END/density/min-gas; for deco, an "About this schedule" panel: model, GF, key compartment info, DecoTengu/Bühlmann/Baker credits. Transparency is the trust story.
- **Cross-tool flow (via `DivePlanContext` from Phase 3):** "Send to planner" actions in Mix (use this best mix as bottom gas), Blender (blended result → gas list), SAC (measured SAC → plan SAC), TankSelector selections shared. Planner is the sink; tools are sources.

## Persistence & sharing (offline-first, no backend)

- Autosave current plan (versioned engine JSON schema) to localStorage; named saved plans list; include plans in the existing preferences backup/restore JSON (extend `preferencesBackup.ts` namespaces).
- **Share = URL**: plan serialized (compressed, e.g. lz-string) into the fragment (`/planner#p=…`) — works statically, offline, and pastes into any chat. Import prompt on open with plan summary + "review before trusting" disclaimer.
- **Print/export:** print stylesheet for runtime table + summary (wet-notes friendly: high contrast, mono, no chrome); JSON export/import of plans.

## Safety UX (non-negotiable)

- First-open acknowledgment modal (SafetyWarningModal pattern): planning tool, not a dive computer; verify against training and other sources; GPL no-warranty.
- Warnings are never hidden by default; dismissing requires per-plan acknowledgment and dismissed warnings remain visible as compact chips.
- Diver-profile gating per `05-DIVER-PROFILE-SPEC.md`: exceeding profile limits (depth, deco, gas types, PPO₂) yields a distinct "beyond your profile" banner — soft gate, explicit acknowledge to proceed, never a hard lock.
- Every schedule footer: model + GF + engine version + schema version (a shared plan must state exactly what produced it).

## Definition of done
- All engine capabilities (OC multi-level, CCR + bailout, lost gas, repetitive, logistics, ICD, CNS/OTU) reachable and visible in UI; no engine warning type lacks a UI surface.
- Validation-matrix dives reproducible through the UI with identical outputs to the engine tests (one E2E test driving the UI for matrix case 3).
- Fully functional offline; plan-in-URL round-trips; print output usable; Lighthouse a11y ≥ 95; mobile usable one-handed for a simple 40 m nitrox plan.
- Nav entry added (replaces the commented-out "Deco Central" sketch in `NavigationMenu.tsx:34`); landing page card updated; WhatsNewModal updated.
