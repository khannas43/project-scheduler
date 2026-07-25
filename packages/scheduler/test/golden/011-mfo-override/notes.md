# 011 — MFO overrides dependency-derived finish

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **MFO** at Monday 5pm (`6780`).

Without MFO, B would finish at Mon 2pm (`6600`). MFO hard-sets the finish
and back-derives the start; the resulting start differs from
depEarlyStart, so `CONSTRAINT_OVERRIDES_DEPENDENCY` fires.

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: depEarlyStart = 6540; MFO forces EF = **6780**.
  ES = subtractWorkingMinutes(6780, 60) = **6720** (≠ 6540 → warning).
- Warning: `CONSTRAINT_OVERRIDES_DEPENDENCY` on task B.
- `projectFinish` = 6780.

## Backward / float

- B: LF = 6780, LS = 6720, TF = 0 (critical).
- A via FS: LF = 6720, LS = 6480, TF = 180.
  Free float = B.ES − A.EF = 180.
