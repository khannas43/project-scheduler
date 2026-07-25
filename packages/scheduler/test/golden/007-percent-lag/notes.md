# 007 — Percentage lag on FS

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B, finish-to-start, `lagPercent = 50` (and a decoy `lagMinutes = 0` that
must be ignored). A = B = 240 working minutes. Mon–Fri 9am–5pm, project start
Monday 9am (`6300`).

## Lag resolution

`lagPercent` is non-null, so it replaces `lagMinutes`:
`Math.round(240 * 50 / 100) = 120` working minutes of lag.

## Forward arithmetic

- A: ES = 6300, EF = 6540 (Mon 13:00).
- B: ES = applyLag(6540, +120) = addWorkingMinutes(6540, 120) = 6660 (Mon 15:00).
  EF: from Mon 15:00, 240 working minutes =
  Mon 15:00→17:00 (120) + Tue 09:00→11:00 (120) = 7860 (Tue 11:00).
  (Tue 09:00 = 5760 + 1440 + 540 = 7740; +120 = 7860.)
- `projectFinish` = 7860.

## Backward arithmetic

- B: LF = 7860, LS = 6660. TF = 0.
- A via FS +120: LF = unapplyLag(B.LS, +120)
  = subtractWorkingMinutes(6660, 120) = 6540; LS = 6300. TF = 0.

## Free float

`FF(A) = B.ES − A.EF = 6660 − 6540 = 120` — equal to the resolved lag on this
FS edge (the §4.6 formula does not subtract lag, so the gap reads as free float
even though total float is still 0 and A is critical).
