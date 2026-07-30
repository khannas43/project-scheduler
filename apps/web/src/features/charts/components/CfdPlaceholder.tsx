/** Explicit CFD out-of-scope panel — not a silent omission or fake chart. */
export function CfdPlaceholder() {
  return (
    <div className="cfd-placeholder" data-testid="cfd-placeholder" role="note">
      <h3>Cumulative flow diagram — not yet available</h3>
      <p>
        A real CFD needs day-by-day historical column membership. This codebase&apos;s audit
        log is write-only today (nothing reads it back), and sprint close records carry-over as
        one aggregate sprint entry rather than per-task moves — so reconstructing “which sprint
        was task X in on date D” would be silently wrong for carried-over work. Building CFD
        properly means new audit coverage, a read path, and snapshot reconstruction — a separate
        feature, not a chart shortcut.
      </p>
    </div>
  );
}
