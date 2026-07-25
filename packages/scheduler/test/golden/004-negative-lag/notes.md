# 004 — Negative lag (lead) on FS

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B, finish-to-start, lag = −60 (a 1-hour lead). Each task 240 working
minutes on Mon–Fri 9am–5pm. Project starts Monday 9am (`6300`).

## Forward arithmetic

- A: ES = 6300, EF = 6540 (Mon 13:00).
- B via FS −60: candidate ES = applyLag(A.EF, −60)
  = subtractWorkingMinutes(6540, 60) = 6480 (Mon 12:00).
  EF = 6480 + 240 = 6720 (Mon 16:00).
- `projectFinish` = 6720.

## Backward arithmetic

- B: LF = 6720, LS = 6480. TF = 0.
- A via FS −60: unapplyLag(B.LS, −60)
  = addWorkingMinutes(6480, 60) = 6540;
  LS = 6540 − 240 = 6300. TF = 0.

## Free float note

`FF(A) = B.ES − A.EF = 6480 − 6540 = −60` — the lead appears as negative free
float under §4.6's lag-agnostic formula. Both tasks remain critical (TF = 0).
