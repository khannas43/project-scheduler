# 005 — FF finish alignment

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B, finish-to-finish, lag 0. A is a full working day (480 min), B is half
(240 min). Mon–Fri 9am–5pm, project start Monday 9am (`6300`).

## Forward arithmetic (§4.4 FF row)

- A: ES = 6300, EF = 6780 (Mon 17:00 — fills the day).
- B: candidate early-finish = applyLag(A.EF, 0) = 6780;
  ES = subtractWorkingMinutes(6780, 240) = 6540 (Mon 13:00);
  EF = 6540 + 240 = 6780.
- `projectFinish` = 6780.

B is forced to finish when A finishes, so it starts halfway through A's day.

## Backward arithmetic (§4.5 FF row)

- B: LF = 6780, LS = 6540. TF = 0.
- A via FF: LF = unapplyLag(B.LF, 0) = 6780; LS = 6300. TF = 0.

## Free float note

`FF(A) = B.ES − A.EF = 6540 − 6780 = −240`. Expected under FF: the successor
starts while the predecessor is still running. Criticality is TF = 0 for both.
