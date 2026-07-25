# 009 — FNET (Finish No Earlier Than)

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **FNET** at Monday 5pm (`6780`).

Without the constraint, B would run Mon 1pm–2pm (`6540`–`6600`).

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B unconstrained candidate finish = addWorkingMinutes(6540, 60) = 6600.
  FNET: earlyFinish = max(6600, 6780) = **6780**.
  earlyStart = subtractWorkingMinutes(6780, 60) = **6720** (Mon 4pm).
- No warning.
- `projectFinish` = 6780.

## Backward / float

- B: LF = 6780, LS = 6720, TF = 0 (critical).
- A via FS: LF = 6720, LS = 6480, TF = 180.
  Free float = B.ES − A.EF = 180.
