# 012 — SNLT soft constraint violated

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **SNLT** at Monday 9am (`6300`).

Soft constraints never move the task. B still starts when A finishes
(Mon 1pm / `6540`), which is later than the SNLT date, so a warning is
emitted and the schedule dates are unchanged from unconstrained CPM.

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: ES = 6540, EF = 6600 (unchanged).
  6540 > 6300 → `SOFT_CONSTRAINT_VIOLATED` on B.
- `projectFinish` = 6600.

## Backward / float

Both tasks are critical with zero float (plain FS chain of 300 working
minutes ending Mon 2pm).
