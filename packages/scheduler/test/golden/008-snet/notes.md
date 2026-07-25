# 008 — SNET (Start No Earlier Than)

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has **SNET** at Monday 3pm (`6660`).

Without the constraint, B would start at A's finish (Mon 1pm / `6540`).

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B depEarlyStart = 6540; SNET = max(6540, 6660) = **6660**.
  EF = 6660 + 60 = **6720** (Mon 4pm).
- No warning (semi-hard: push later, never earlier).
- `projectFinish` = 6720.

## Backward / float

- B: LF = 6720, LS = 6660, TF = 0 (critical).
- A via FS: LF = B.LS = 6660, LS = 6420, TF = 120.
  Free float = B.ES − A.EF = 120.
