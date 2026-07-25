# 014 — Deadline missed

**Not MS Project output.** Hand-computed / self-verified (same caveat as 001).

## Scenario

A → B (FS, no lag). A is 240 working minutes; B is 60. Mon–Fri 9am–5pm.
Project starts Monday 9am (`6300`). B has a **deadline** at Monday 1pm
(`6540`) — the instant A finishes, before B has run at all.

Deadlines never move a task (§4.4 rule 4). Dates match unconstrained CPM;
only a `DEADLINE_MISSED` warning is added.

## Forward arithmetic

- A: ES = 6300, EF = 6540.
- B: ES = 6540, EF = 6600 (Mon 2pm).
  6600 > 6540 → `DEADLINE_MISSED` on B.
- `projectFinish` = 6600.

## Backward / float

Both tasks critical with zero float (plain FS chain).
