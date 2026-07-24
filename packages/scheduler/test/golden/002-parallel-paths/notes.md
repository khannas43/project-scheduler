# 002 — Parallel paths

**Not MS Project output** — see 001's notes.md for why.

## Scenario

Same critical A → B chain as case 001 (fills the working day exactly), plus
an independent 1-hour task `Short` with no dependency at all, on the same
calendar.

## Expected behaviour

`Short` starts at projectStart (9am) like A does, but only needs 1 hour, so
it finishes at 10am while the project doesn't finish until 5pm (driven by
the A→B chain). It has no successor, so its free float equals its total
float: 7 hours (420 minutes) of slack between 10am and the 5pm project
finish. It's excluded from the critical path — only A and B, whose combined
duration exactly consumes the working day with zero slack, are critical.
