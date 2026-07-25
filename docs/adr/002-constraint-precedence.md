# ADR 002: Constraint precedence (hard / semi-hard / soft) and ALAP deferral

## Status
Accepted

## Context
§4.4 defines eight constraint types and a four-rule precedence model for how
they interact with dependency-derived dates during the forward pass. Build
order item 29 asks for all eight types plus an ADR capturing those rules.
Seven types (`asap`, `snet`, `snlt`, `fnet`, `fnlt`, `mso`, `mfo`) are
implementable as a per-task adjustment after dependency-derived
`depEarlyStart` is known. The eighth — `alap` — looks equally local at first
glance but is not, for a correctness reason spelled out under Decision below.

Deadlines (§4.4 rule 4 / build order item 30) are a separate concept from
task constraints: they constrain the project finish rather than a single
task's early dates. They are out of scope here and mentioned only because
the precedence *rule* that ranks them already exists in the design doc.

## Decision

### Precedence model (§4.4's four rules)

1. **Hard constraints** (`mso`, `mfo`) win over dependency-derived dates.
   The constrained start/finish is applied unconditionally. Whenever that
   changes the schedule relative to the unconstrained dependency result,
   emit `CONSTRAINT_OVERRIDES_DEPENDENCY`. Demonstrated by golden case
   `010-mso-override` (and also `011-mfo-override`).
2. **Semi-hard constraints** (`snet`, `fnet`) may only push a task later,
   never earlier: `earlyStart = max(depEarlyStart, constraintDate)` (and the
   finish-mirrored form for `fnet`). No warning.
3. **Soft constraints** (`snlt`, `fnlt`) never move a task. If the
   unconstrained early date already violates the limit, emit
   `SOFT_CONSTRAINT_VIOLATED` and leave dates alone. Demonstrated by
   `012-snlt-violated` and `013-fnlt-violated`.
4. **Deadlines** (item 30, not implemented here) sit outside this per-task
   step; they will produce their own warning path when that work lands.

`asap` / `null` are unconstrained no-ops. Date-requiring types with a null
`constraintDate` throw — the engine does not silently ignore malformed
input.

### ALAP is deliberately deferred

The obvious ALAP implementation — after the backward pass, snap an ALAP
task's `earlyStart`/`earlyFinish` to its `lateStart`/`lateFinish` — is only
safe for a task with **no successors**. If the task has any successor, that
successor's `earlyStart` was computed during the forward pass from this
task's *original* (ASAP-derived) `earlyFinish`, which is always ≤ its
`lateFinish` when total float is non-negative. Retroactively snapping this
task's reported `earlyFinish` to the later `lateFinish` without also
re-propagating that change forward through every successor (recursively)
can leave a successor's *displayed* `earlyStart` before this task's
*displayed* `earlyFinish` — a visibly inconsistent FS schedule, and a real
correctness bug rather than a rough edge. Doing this fully correctly needs
a re-propagation pass over the downstream subgraph seeded from the ALAP
task's late dates. That is meaningfully more than "one more constraint
type."

Therefore this release:

- throws if `constraintType === 'alap'` and the task has successors, naming
  the task and pointing at this ADR;
- also throws if `constraintType === 'alap'` and the task has **no**
  successors — the no-successor case is actually safe and simple by the
  reasoning above, but half-implementing it now would leave an asymmetric
  surface; a future task can pick up that arm cheaply once someone needs it.

## Consequences
- `runForwardPass` returns `{ results, warnings }` so constraint warnings
  can reach `schedule()`'s `SchedulerOutput.warnings` (a deliberate
  breaking change to the forward-pass return shape).
- Negative total float remains the signal when a hard constraint forces a
  start earlier than dependencies would allow; no new float formulas are
  required (§4.6 already covers this).
- ALAP stays unimplemented until a dedicated re-propagation design lands;
  callers that set `alap` get a loud error rather than a silently wrong
  schedule.
- Deadlines remain item 30 and do not share these warning codes.
