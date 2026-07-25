# 200 — Reference plan (Phase 2 capstone)

**Not MS Project output.** §11.1's build-order item names an MS Project
comparison; that install isn't available here. Same standing caveat as
`001`–`015`: hand-computed sample + engine-generated `expected.json` for the
full 193-leaf graph, with global invariants in
`packages/scheduler/test/referencePlanInvariants.test.ts` covering the rest.

## Plan shape

| | |
|---|---|
| Schedulable (leaf) tasks | **193** |
| Summary tasks | **10** (ROOT → P1…P5, with P2N/P2C and P3A/P3B) |
| Dependencies | **197** |
| Critical path | **130** tasks: `P1T01` → … → `P5T16` |
| `projectFinish` | `68700` |

**Calendars**

- `cal-cont` — 24/7 continuous. Hosts the critical spine so weekend/holiday
  packing cannot insert artificial float gaps into the classical TF=0 chain.
- `cal-std` — Mon–Fri 9–5 with a Wednesday holiday on day index 9
  (`HOLIDAY = 18720`). Side streams, constraint demos, deadline tip.
- `cal-ops` — Mon–Sat 8–18. Every 5th `P2CT*` task.

**WBS / streams**

- **Spine (critical):** P1 (30 × 480 min) → P2N (34) → P3A (28) → P4 (22) →
  P5 (16), all FS, all on `cal-cont`.
- **P2C parallel infra (float):** 32 tasks on `cal-std`/`cal-ops`, starting at
  `projectStart` (not linked from the cont spine — a cont→business-calendar
  handoff would park `earlyStart` on a weekend). Carries SS+lag, FF, SF,
  negative lag, and 50% lag samples.
- **P3B side app stream** on `cal-std`.
- **Specialty tips:** SNET/FNET/SNLT/FNLT/ASAP chain off `P1T01`; MSO spur
  off `P2CT04`; MFO tip off `P3BT04`; deadline tip off `P4T06`.

**Warnings present in `expected.json`**

- `SOFT_CONSTRAINT_VIOLATED` — `SPEC_SNLT`
- `CONSTRAINT_OVERRIDES_DEPENDENCY` — `SPEC_MSO_B`, `SPEC_MFO`
- `DEADLINE_MISSED` — `SPEC_DEADLINE`

No `alap` (still deferred per ADR 002).

## Hand-verified sample

All values are UTC epoch minutes. Project start = Monday 9am = `6300`
(horizon Monday midnight = `5760`). On `cal-cont`, working time is continuous,
so duration arithmetic is ordinary addition.

### 1–3. Spine start — `P1T01`, `P1T02`, `P1T03`

Each spine task is 480 minutes. For spine index `k` (1-based along the
130-task path):

- `ES = 6300 + (k − 1) × 480`
- `EF = 6300 + k × 480`

| Task | k | ES | EF |
|------|---|----|----|
| P1T01 | 1 | 6300 | 6780 |
| P1T02 | 2 | 6780 | 7260 |
| P1T03 | 3 | 7260 | 7740 |

Matches `expected.json`. All TF = FF = 0, critical.

### 4. Spine finish — `P5T16`

`k = 130` → ES = 6300 + 129×480 = **68220**, EF = **68700** = `projectFinish`.
TF = 0, critical. Confirms the unbroken 130-task chain.

### 5. SNET — `SPEC_SNET`

Independent tip on `cal-std` (no predecessor — starts at project start
`6300`). SNET date = Tue 9am = `5760 + 1440 + 540 = 7740`.

- `earlyStart = max(6300, 7740) = 7740`
- `earlyFinish = 7740 + 120 = 7860` (Tue 9–11am)

Large positive float. No warning (semi-hard).

### 6–7. MSO override — `SPEC_MSO_A` / `SPEC_MSO_B`

`SPEC_MSO_A` finishes `9420`. Generator sets MSO to
`addWorkingMinutes(9420, 120, cal-std) = 9540`.

- Dependency-derived start for B would be `9420`
- MSO forces ES = **9540** ≠ 9420 → `CONSTRAINT_OVERRIDES_DEPENDENCY`
- EF = 9540 + 60 = **9600**
- Large float — spur is off the critical path (by design)

### 8. MFO override — `SPEC_MFO`

Unconstrained probe finish pushed by +120 working minutes on `cal-std`.
Resulting ES/EF in expected: **26820 / 26880**. Emits
`CONSTRAINT_OVERRIDES_DEPENDENCY`. Off-critical.

### 9. Soft SNLT violated — `SPEC_SNLT`

After `SPEC_FNET`. SNLT date = project start `6300`; actual ES = **8220** > 6300
→ `SOFT_CONSTRAINT_VIOLATED`. Dates unchanged by the soft constraint.

### 10. Deadline missed — `SPEC_DEADLINE`

FS from `P4T06` on `cal-cont`. Deadline = `6300`; EF = **53580** ≫ deadline →
`DEADLINE_MISSED`. Dead-end tip (does not rejoin the spine), so it keeps
float and does not fracture the critical chain.

### 11–12. SS + lag — `P2CT05` → `P2CT08`

Additional SS+120 edge alongside the FS spine through 06/07. On `cal-std`:

- `P2CT05` ES = 8220 (from expected)
- Actual `P2CT08` ES = **10740** (driven by the longer FS chain through 06/07,
  not by the SS edge) — SS is present in the graph and exercised, but not
  binding here.

### 13–14. Negative lag — `P2CT12` → `P2CT14`

FS with `lagMinutes = -60` (lead), in addition to the FS chain via `P2CT13`.
`P2CT14` ES = **17940** in expected; the lead edge is active in the
predecessor max but the chain through 13 remains competitive.

### 15. Percentage lag — `P2CT25` → `P2CT27`

`lagPercent = 50` of predecessor duration 240 → 120 working minutes, replacing
`lagMinutes`. Expected `P2CT27` ES = **29700**. (Also linked via `P2CT26` on
the FS spine.)

### 16. Ops calendar — `P2CT10` (10 % 5 === 0 → `cal-ops`)

Mon–Sat 8–18. ES/EF **12180 / 12420** in expected — a mid-stream ops task
proving multi-calendar compilation at scale.

## Why `expected.json` is engine-generated

Hand-computing 193 leaves would either force a trivial plan or produce numbers
nobody checked. The contract for this case is: (1) the sample above is
hand-checked to the same standard as `001`–`015`, and (2) the five §11.2-style
invariants in `referencePlanInvariants.test.ts` hold over the full output.
