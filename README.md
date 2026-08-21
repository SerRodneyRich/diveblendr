# DiveBlendr

**Technical diving tools that show their working — open source, offline, no account.**

[![Live app](https://img.shields.io/badge/Live%20app-diveblendr.com-blue?style=flat-square)](https://diveblendr.com)
[![License](https://img.shields.io/github/license/SerRodneyRich/Diveblendr?style=flat-square)](LICENSE)
[![Issues](https://img.shields.io/github/issues/SerRodneyRich/Diveblendr?style=flat-square)](https://github.com/SerRodneyRich/Diveblendr/issues)
[![Discussions](https://img.shields.io/github/discussions/SerRodneyRich/Diveblendr?style=flat-square)](https://github.com/SerRodneyRich/Diveblendr/discussions)

DiveBlendr plans gas, not decompression — for now. It works out best mix, checks a
gas against the depth you want it at, tells you what to put in the tank you already
have, and does the consumption arithmetic. Every number traces to a published
standard, and the app will show you the formula it used.

It runs entirely in your browser. Nothing is uploaded, there is no account, and
after the first load it works with no internet at all — which is the state most
dive sites are in.

Built by a JJ-CCR / TDI MOD 2 diver who wanted tools he could audit.

---

## Why it exists

Most gas planning tools give you a number and expect you to trust it. Two problems
with that.

The first is that the number is often the wrong one. Ask most calculators for the
maximum operating depth of air on a 1.30 bar CCR setpoint and you get 51 m — the
depth where oxygen partial pressure hits the limit. But at 51 m that gas has an
equivalent narcotic depth of 51 m against a 30 m limit, and a density of 7.2 g/L
against a 5.7 g/L target. Its real limit is 30 m, bound by narcosis, and 51 m is a
number that will hurt you. **DiveBlendr never shows an oxygen MOD as an operating
depth.** It reports the shallowest of the oxygen, narcosis and density limits, and
names which one binds.

The second is that you cannot check it. Here you can: the maths is a few hundred
lines of dependency-free TypeScript with tests next to it, every constant cites the
agency or paper it came from, and the app renders the actual formula on screen.

If the maths is wrong, [open an issue](https://github.com/SerRodneyRich/Diveblendr/issues)
with the mix, the depth and what you expected. That is the entire point of doing
this in the open.

---

## What it does

| Tool | What it answers |
|---|---|
| **Best mix** | The richest mix for a target depth, on OC or CCR, with the limit that binds it named |
| **MOD check** | How deep a given gas may actually be taken — oxygen, narcosis and density together — plus CNS% for the exposure |
| **Gas blender** | What to add to the gas already in the cylinder to reach a target mix, using real-gas (Van der Waals) partial pressures rather than ideal-gas approximations |
| **Gas planning** | Bottom time, turn pressure and minimum gas from your consumption and reserve rules |
| **SAC / RMV** | Surface air consumption and respiratory minute volume from a real dive |
| **Conditions** | Tides, waves, current and sun times for a dive site, from the Open-Meteo marine model |
| **Photo editor** | Underwater colour correction modelled on how water actually absorbs light, using the Jerlov optical water types |
| **Share card** | Turns a Garmin `.fit` or Shearwater export into a shareable depth-profile graphic |

Dive modes: open-circuit nitrox, open-circuit trimix, CCR with nitrox diluent, CCR
with trimix diluent. Metric and imperial throughout — including inside the warning
text, which is written in the units you actually dive.

### Not ready yet

**The decompression planner is in development and is not usable.** The Bühlmann
ZHL-16C engine with gradient factors exists under `src/lib/deco/` and has 151 unit
tests, but it has not yet been validated against an independent implementation
across a full matrix of profiles. Until it has, the `/planner` route says so
plainly rather than producing a schedule. Do not plan a dive on it.

---

## Try it

**[diveblendr.com](https://diveblendr.com)** — installable on iOS, Android, macOS
and Windows as a PWA. Add it to your home screen and it works offline.

---

## Running it locally

```bash
git clone https://github.com/SerRodneyRich/Diveblendr.git
cd Diveblendr
pnpm install
pnpm dev            # http://localhost:3000
```

This project uses **pnpm** (`pnpm-lock.yaml` is the lockfile). If you do not have
it: `npm install -g pnpm`.

**No API keys are needed for anything.** Every environment variable in
`.env.example` is optional and configures analytics or search-engine verification.
Skip `.env.local` entirely — the calculations do not touch the network, and the
conditions tool uses Open-Meteo's free, keyless API.

```bash
pnpm test           # Vitest — the calculation suite
pnpm test:watch
pnpm lint
pnpm build          # static export to out/, then the service worker
npx tsc --noEmit    # typecheck
```

Stale cache causing trouble: `rm -rf .next out && pnpm build`.

---

## How it is built

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, `output: export` |
| Language | TypeScript, strict |
| UI | React 19, Tailwind CSS v4 |
| Charts | Chart.js |
| Maths rendering | KaTeX, bundled — the formulas render offline too |
| Testing | Vitest |
| Hosting | Vercel, static CDN |

The build is a fully static export: no server, no API routes, no runtime
dependency on anything. Serve `out/` from any web server or a file system.

The service worker is generated **after** the export by `scripts/build-sw.mjs`
using workbox-build. Do not reintroduce a PWA webpack plugin — the header comment
in that script explains what happened last time.

### Layout

```
src/
├── lib/              # All calculation code. Pure, framework-free, tested.
│   ├── deco/         # Bühlmann ZHL-16C + gradient factors (in development)
│   ├── dive/         # Dive-log parsing: Garmin .fit, Shearwater CSV/XML
│   ├── photo/        # Underwater colour correction, Jerlov water types
│   ├── conditions/   # Tide series handling
│   ├── gas.ts        # MOD, END, density, CNS
│   ├── blending.ts   # Real-gas blending
│   ├── operatingDepth.ts   # The shallowest binding limit
│   ├── limits.ts     # Every threshold, each with its source cited
│   └── warnings.ts   # Warning text, unit-aware
├── components/       # React components, incl. the ui/ primitive library
├── contexts/         # Preferences, Units, Accessibility, Favorites
├── config/           # Navigation
└── app/(tools)/      # One route per tool, inside the app shell
```

Calculation code imports no React and prints nothing to the console. If it cannot
be tested from a plain Node process, it is in the wrong directory.

---

## The standards it follows

Every threshold below is in [`src/lib/limits.ts`](src/lib/limits.ts) with its
source in a comment, and every one is configurable in the app's preferences.

### Oxygen

| Setting | Default | Source |
|---|---|---|
| OC working ppO₂ | 1.40 bar | NOAA / TDI |
| OC deco ceiling | 1.60 bar | NOAA / TDI |
| CCR setpoint | 1.30 bar | TDI / IANTD CCR practice |
| Hypoxia floor | 0.16 bar | Below this, risk of losing consciousness |

Partial pressures are stated in **bar in both unit systems**, because that is how
every agency, table and dive computer states them. A ppO₂ in psi is a number no
diver would recognise inside a safety warning.

CNS% comes from the NOAA oxygen exposure table.

### Gas density

| Threshold | Value | Source |
|---|---|---|
| Warning | 5.7 g/L | App default, between the two figures below |
| Do not exceed | 6.2 g/L | Anthony & Mitchell (2016), the hard ceiling |

Anthony & Mitchell, *Respiratory physiology of rebreather diving* (2016), adopted
by NEDU and widely taught, gives **5.2 g/L as the ideal target** and **6.2 g/L as
the do-not-exceed ceiling**. DiveBlendr warns at 5.7 g/L by default — between the
two — and the threshold is configurable, so set it to 5.2 if that is how you were
taught. Density is temperature-corrected.

### Narcosis

Equivalent narcotic depth defaults to the **nitrogen-only** model (IANTD / GUE
convention). The NOAA / DCIEM model, which counts oxygen as narcotic too, is
available as an option.

### Conservative rounding

Rounding direction is a safety decision, not a formatting one.

| Value | Direction | Why |
|---|---|---|
| MOD | **Down** | Never round a depth limit deeper than the maths allows |
| END | **Up** | Never round a narcosis estimate shallower than it is |
| O₂ fraction | **Down** | A richer mix than calculated shortens the MOD you planned |
| He fraction | **Up** | Keeps at least the narcotic protection you planned for |

**Never make a limit less conservative** without the maintainer explicitly asking.

### Where the analysis is done

END, density and CNS are evaluated at **the depth the diver asked for**, never at
the operating depth. Clamping them to the operating depth makes every gas look
clean by construction — that depth was chosen *because* it satisfies the limits —
and silently deletes the breach warnings. This was nearly shipped once; there are
now permanent tests in both directions.

---

## Contributing

Full guide in **[CONTRIBUTING.md](CONTRIBUTING.md)**. The short version:

1. **Found a wrong number?** Open an [issue](https://github.com/SerRodneyRich/Diveblendr/issues)
   with the exact mix, depth, dive mode and units, what DiveBlendr said, and what
   you expected. Those are the most valuable reports this project gets.
2. **Fixing something?** Fork, branch, PR. **Any change to a calculation must cite
   its source** — NOAA, Bühlmann, Baker, or a named agency standard — in a code
   comment, and must come with a test.
3. **Proposing a feature?** [Discussions](https://github.com/SerRodneyRich/Diveblendr/discussions)
   first, before writing code.

A test that passes is not the bar. The whole calculation suite was green while the
MOD check page displayed air to 51 m on a rebreather: every function was correct
and the page rendered the wrong field. Anything safety-critical needs a test
against the **rendered output**, and the test must be shown to fail if the defect
is reintroduced.

### Where help is wanted

- **Validating the deco engine.** The highest-value contribution available. Compare
  `src/lib/deco/` against an independent implementation across a matrix of profiles
  and report the divergences.
- **Trimix beyond 100 m.** The maintainer's certification stops at MOD 2.
- **Dive computer formats** beyond Garmin `.fit` and Shearwater.
- **Metric/imperial edge cases** — walk a tool end to end in feet and report what
  reads wrong.

---

## Licence and attribution

[GNU General Public License v3.0](LICENSE). Free to use, study, modify and fork;
any derivative must also be GPL-3.0. Commercial use without releasing source is not
permitted.

[`NOTICE.md`](NOTICE.md) credits the work this stands on: **DecoTengu** (Artur
Wroblewski, GPL-3.0) as the deco engine's port source, **Erik Baker**'s papers on
M-values and gradient factors, **Bühlmann**'s ZH-L16, the **NOAA Diving Manual**,
and **Doolette & Mitchell**.

Note for contributors: **do not copy code from Subsurface.** It is GPL-2.0-only,
which is incompatible with this repository's GPL-3.0. It may be used as a
validation oracle — comparing outputs — but not as a source of code.

---

## On how this was built

DiveBlendr is written by its maintainer working with Claude (Anthropic's AI
assistant). That is stated plainly because you should know how a tool you might
trust underwater was made.

What matters is not who typed a line but whether it is right, and whether you can
check it. So: every constant cites a source, every calculation has tests, the tests
are shown to fail when the defect they guard against is reintroduced, and all of it
is in this repository for you to read. The failure mode of AI-written code is
plausible-looking work that is subtly wrong — which is also the failure mode of
tired human code, and the answer is the same either way. Verify it.

A human maintainer approves every merge.

---

## Safety

**DiveBlendr is planning and educational software. It is not a dive computer.**

Verify every calculation with certified dive planning software and your instructor
before using it in the water. Technical diving requires proper training and
certification. The authors accept no responsibility for decisions made from these
calculations.

---

*The maths is open. If you see something wrong, say so.*
