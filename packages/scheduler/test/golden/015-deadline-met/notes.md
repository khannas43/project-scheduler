# 015 — Deadline met

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

Same network as 014 (A → B FS, A 240 / B 60, Mon–Fri 9–5, project start
Mon 9am). B's **deadline** is Monday 5pm (`6780`), after B's early finish
of Mon 2pm (`6600`).

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: ES = 6540, EF = 6600.
  6600 ≤ 6780 → no warning.
- `projectFinish` = 6600.

## Backward / float

Both tasks critical with zero float — identical schedule to 014, only the
warnings array differs.
