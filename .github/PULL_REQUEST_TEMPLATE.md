## What does this PR do?

<!-- Brief description of the change -->

## Type of change
- [ ] Bug fix (calculation error, UI issue)
- [ ] Safety-critical fix (incorrect gas math, dangerous output)
- [ ] New feature / calculator
- [ ] Refactor / performance improvement
- [ ] Documentation / content update
- [ ] Dependency update

## Calculation changes
<!-- If you changed any gas math, fill this in. Otherwise delete this section. -->

**What changed:** 

**Diving standard / citation that supports this:**

**Before / after example:**
| Input | Before | After | Correct |
|-------|--------|-------|---------|
| e.g. 18/45 at 60m | XX m END | YY m END | ZZ m END |

## Pre-merge checklist
- [ ] `rm -rf .next && npm run build` passes (all 9 pages prerender)
- [ ] `npm run lint` passes
- [ ] Conservative rounding direction preserved (O2 down, He up, N2 down, MOD down)
- [ ] No `.env.local` or secrets committed
- [ ] Any new browser-API components use `dynamic(..., { ssr: false })`
- [ ] No new `any` types in calculation code
