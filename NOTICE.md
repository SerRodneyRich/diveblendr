# NOTICE — Third-Party Work and Attribution

DiveBlendr is licensed under the **GNU General Public License v3.0** (see `LICENSE`).

This file credits the projects, publications, and standards that DiveBlendr's
calculations are built on. Dive planning software is a chain of trust: the people
below did the hard work of establishing and publishing this science, and much of it
was given away freely so that divers everywhere could plan safely. We are standing on
their shoulders, and we say so plainly.

If you believe any attribution here is incomplete or incorrect, please open an issue.

---

## Decompression modelling

### DecoTengu — GPL-3.0
Copyright © Artur Wroblewski.
Project: <https://wrobell.dcmod.org/decotengu/>

DiveBlendr's decompression engine (`src/lib/deco/`) is a **TypeScript port of
DecoTengu**, a Python dive decompression library implementing the Bühlmann model
(ZH-L16B-GF / ZH-L16C-GF) with Erik Baker's gradient factors. Ported source files
carry a header identifying the origin file. DecoTengu is GPL-3.0, which is the
license DiveBlendr itself is distributed under.

### Subsurface — GPL-2.0 (reference and validation only)
Copyright © Subsurface contributors (Linus Torvalds, Dirk Hohndel, and many others).
Project: <https://subsurface-divelog.org/>

Subsurface is used by this project **as a validation oracle only**. Decompression
schedules produced by DiveBlendr are compared against schedules produced by
Subsurface's planner to verify correctness (see the validation matrix in
`docs/plans/02-DECO-ENGINE-SPEC.md`).

**No Subsurface code is copied into this project.** Subsurface's decompression core is
licensed GPL-2.0-*only*, which is not compatible with this project's GPL-3.0 license.
Comparing computed outputs carries no such restriction. Contributors must not port,
transcribe, or adapt Subsurface source into this repository.

### Erik C. Baker
The gradient factor method used throughout the engine is Erik Baker's. His papers —
notably *"Understanding M-values"* and *"Clearing Up The Confusion About 'Deep Stops'"* —
are the mathematical authority for our implementation, and were published freely for
the diving community's benefit.

### Prof. Albert A. Bühlmann
The ZH-L16 compartment model and its coefficient tables originate in Bühlmann's
decompression research (*Tauchmedizin* / *Decompression–Decompression Sickness*).

### NOAA
Oxygen exposure limits (CNS% single-exposure table) are taken from the
**NOAA Diving Manual**. The oxygen tolerance unit (OTU / REPEX) methodology derives
from work by Bill Hamilton and colleagues.

### Isobaric counterdiffusion
The gas-switching screening heuristic (the "rule of fifths") and the inner-ear DCS
mechanism it guards against draw on the work of **Doolette & Mitchell**, notably
*"Biophysical basis for inner ear decompression sickness"* (2003).

---

## Physics and data

- **Van der Waals real-gas corrections** — standard published constants for O₂, N₂, He,
  and Ar are used for compressibility corrections during gas blending.
- **Tank specifications** (`src/data/tankSpecifications.ts`) are compiled from
  manufacturer published specifications (Luxfer, Catalina, Faber, Worthington).
  They are data, not creative work, and are included for user convenience.

---

## Software dependencies

DiveBlendr is built with Next.js, React, Tailwind CSS, chart.js, KaTeX, Workbox, and
other open-source packages. Each retains its own license; see `package.json` and the
corresponding entries in `node_modules` for the full set and their terms.

---

## How this software was built

DiveBlendr is written by its maintainer — a JJ-CCR / TDI MOD 2 technical diver — **together
with AI**, specifically Anthropic's Claude (Fable and Opus models). This is stated openly
because divers deserve to know the provenance of a tool they plan life-support gas with.

Provenance is not a substitute for verification, in either direction: human-written dive
software has shipped fatal errors, and so can AI-assisted software. What makes a calculation
trustworthy here is that it is **checkable** — every formula cites a published standard, every
calculation module is unit-tested against hand-derived values, decompression schedules are
validated against independent implementations, and all of it is in this repository for anyone
to audit. If you find an error, please open an issue; that is what open source is for.

## A note on why this matters

Several commercial dive-planning apps are built on exactly this same freely published
science and then sold. That is legally permitted for the underlying science, and it is
not what this project does. DiveBlendr is free, open source, and GPL-3.0 — if you
distribute a modified version, you must pass the same freedom on. Safety tooling should
be free.
