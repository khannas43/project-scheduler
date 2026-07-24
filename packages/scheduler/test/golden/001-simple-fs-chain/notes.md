# 001 — Simple FS chain

**Not MS Project output.** §11.1 calls for these to be built in MS Project
and cross-checked; that isn't available in this environment. This case (and
002) are hand-computed and self-verified instead, kept in the same
directory shape so real MS Project cases can replace or join them later
without changing the harness.

## Scenario

Two tasks, A → B (finish-to-start, no lag), each 4 working hours, on a
Mon–Fri 9am–5pm calendar. Project starts Monday 9am.

## Expected behaviour

- A: 9am–1pm (fills exactly half the working day).
- B: starts the instant A finishes (1pm), runs to 5pm.
- Together they exactly fill the 8-hour working day with no slack anywhere,
  so both are critical with zero float, and `projectFinish` (no explicit
  deadline, so it's derived as the latest early_finish) lands at 5pm.

All values are UTC epoch minutes (§4.1's `EpochMinutes`). `horizonStart:
5760` is minute 0 of 1970-01-05 (a Monday) — the same anchor used throughout
`packages/scheduler`'s test suite; day 0 of the Unix epoch (1970-01-01) was
a Thursday.
