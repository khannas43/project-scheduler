# 013 — FNLT soft constraint violated

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **FNLT** at Monday 1pm (`6540`).

Soft constraints never move the task. B finishes at Mon 2pm (`6600`),
which is later than the FNLT date, so a warning is emitted and dates
match unconstrained CPM.

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: ES = 6540, EF = 6600 (unchanged).
  6600 > 6540 → `SOFT_CONSTRAINT_VIOLATED` on B.
- `projectFinish` = 6600.

## Backward / float

Both tasks are critical with zero float (same as 012's unconstrained
chain).
