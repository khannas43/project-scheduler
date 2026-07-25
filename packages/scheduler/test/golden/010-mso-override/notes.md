# 010 — MSO overrides dependency-derived start

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

This is the golden case referenced by `docs/adr/002-constraint-precedence.md`
for `CONSTRAINT_OVERRIDES_DEPENDENCY`.

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **MSO** at Monday 3pm (`6660`).

Dependency-derived early start for B would be A's finish (Mon 1pm / `6540`).
MSO hard-sets the start to `6660` anyway and emits the override warning
because the constrained start differs from the dependency-derived one.

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: depEarlyStart = 6540; MSO forces ES = **6660** (≠ dep → warning).
  EF = 6660 + 60 = **6720**.
- Warning: `CONSTRAINT_OVERRIDES_DEPENDENCY` on task B.
- `projectFinish` = 6720.

## Backward / float

- B: LF = 6720, LS = 6660, TF = 0 (critical).
- A via FS: LF = 6660, LS = 6420, TF = 120.
  Free float = B.ES − A.EF = 120.
