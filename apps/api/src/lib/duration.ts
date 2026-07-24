const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const DURATION_PATTERN = /^(?<amount>\d+)\s*(?<unit>s|m|h|d)$/;

/** Parses a short duration string like '15m' or '7d' (jose's setExpirationTime format) into whole seconds. */
export function parseDurationToSeconds(input: string): number {
  const match = DURATION_PATTERN.exec(input.trim());
  const amount = match?.groups?.amount;
  const unit = match?.groups?.unit as keyof typeof UNIT_MS | undefined;

  if (!amount || !unit) {
    throw new Error(`Invalid duration string: ${input}`);
  }

  return Math.floor((Number(amount) * UNIT_MS[unit]) / 1000);
}
