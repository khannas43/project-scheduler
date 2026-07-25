# 006 — SF with positive lag

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B, start-to-finish, +240 working-minute lag. A = 240 min, B = 120 min.
Mon–Fri 9am–5pm, project start Monday 9am (`6300`).

The +240 lag keeps B's derived finish inside Monday's working day, so the
calendar-aware `subtractWorkingMinutes` for B's duration never walks before
the compiled horizon.

## Forward arithmetic (§4.4 SF row)

- A: ES = 6300, EF = 6540.
- B: candidate early-finish = applyLag(A.ES, +240)
  = addWorkingMinutes(6300, 240) = 6540 (Mon 13:00);
  ES = subtractWorkingMinutes(6540, 120) = 6420 (Mon 11:00);
  EF = 6420 + 120 = 6540.
- `projectFinish` = 6540.

## Backward arithmetic (§4.5 SF row)

- B: LF = 6540, LS = 6420. TF = 0.
- A via SF: candidate late-start = unapplyLag(B.LF, +240)
  = subtractWorkingMinutes(6540, 240) = 6300;
  LF = addWorkingMinutes(6300, 240) = 6540; LS = 6300. TF = 0.

## Free float note

`FF(A) = B.ES − A.EF = 6420 − 6540 = −120`. Again a non-FS shape producing
negative free float under the §4.6 formula; both tasks are critical on TF.
