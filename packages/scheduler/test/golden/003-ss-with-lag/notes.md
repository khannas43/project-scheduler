# 003 — SS with positive lag

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B, start-to-start, +60 working-minute lag. Each task 240 working minutes
on Mon–Fri 9am–5pm. Project starts Monday 9am (`6300`).

## Forward arithmetic

- A (no preds): ES = 6300 (Mon 9:00), EF = 6300 + 240 = 6540 (Mon 13:00).
- B via SS +60: candidate ES = applyLag(A.ES, +60)
  = addWorkingMinutes(6300, 60) = 6360 (Mon 10:00).
  EF = 6360 + 240 = 6600 (Mon 14:00).
- `projectFinish` = max EF = 6600.

## Backward arithmetic

- B (no succs): LF = 6600, LS = 6600 − 240 = 6360. TF = 0.
- A via SS +60: candidate late-start = unapplyLag(B.LS, +60)
  = subtractWorkingMinutes(6360, 60) = 6300;
  LF = addWorkingMinutes(6300, 240) = 6540; LS = 6300. TF = 0.

## Free float note

§4.6's free-float formula is link-type-agnostic:
`FF(A) = B.ES − A.EF = 6360 − 6540 = −180`.
Negative free float is expected here — under SS, B is allowed to start before
A finishes. Total float remains the criticality signal (both TF = 0).
