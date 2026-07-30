import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { useSprints } from '../../sprints/hooks/useSprints.js';
import type { SprintRow } from '../../sprints/types.js';
import { useProjectVelocity, useSprintPointsSummary } from '../hooks/useCharts.js';
import { BurndownChart } from './BurndownChart.js';
import { BurnupChart } from './BurnupChart.js';
import { CfdPlaceholder } from './CfdPlaceholder.js';
import { VelocityChart } from './VelocityChart.js';

function pickDefaultSprintId(sprints: readonly SprintRow[]): string | null {
  if (sprints.length === 0) return null;
  const active = sprints.find((s) => s.state === 'active');
  return (active ?? sprints[0])!.id;
}

export function AgileChartsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const sprintsQuery = useSprints(projectId);
  const velocityQuery = useProjectVelocity(projectId);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);

  const sprints = sprintsQuery.data ?? [];

  useEffect(() => {
    if (selectedSprintId !== null) return;
    if (!sprintsQuery.data) return;
    setSelectedSprintId(pickDefaultSprintId(sprintsQuery.data));
  }, [sprintsQuery.data, selectedSprintId]);

  const pointsQuery = useSprintPointsSummary(selectedSprintId);

  return (
    <div className="page agile-charts-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects/$projectId" params={{ projectId }}>
              ← Project
            </Link>
          </p>
          <h1>Agile charts</h1>
          <p className="lede muted">
            Velocity from closed sprints; burndown/burnup from current composition (ideal line +
            current point — not a fabricated historical curve).
            {' · '}
            <Link to="/projects/$projectId/board" params={{ projectId }}>
              Board
            </Link>
            {' · '}
            <Link to="/projects/$projectId/backlog" params={{ projectId }}>
              Backlog
            </Link>
          </p>
        </div>
      </header>

      <section className="chart-section" aria-labelledby="velocity-heading">
        <h2 id="velocity-heading">Velocity</h2>
        {velocityQuery.isLoading ? <p className="muted">Loading velocity…</p> : null}
        {velocityQuery.isError ? (
          <p className="form-error">Could not load velocity.</p>
        ) : null}
        {velocityQuery.data ? <VelocityChart data={velocityQuery.data} /> : null}
      </section>

      <section className="chart-section" aria-labelledby="burndown-heading">
        <div className="chart-section-header">
          <h2 id="burndown-heading">Burndown</h2>
          <label className="field board-sprint-picker">
            Sprint
            <select
              value={selectedSprintId ?? ''}
              onChange={(e) => setSelectedSprintId(e.target.value || null)}
              disabled={sprints.length === 0}
              aria-label="Sprint for burndown and burnup"
            >
              {sprints.length === 0 ? <option value="">No sprints</option> : null}
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.state === 'active' ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted chart-honesty">
          Points reflect the sprint&apos;s <em>current</em> task set — not day-1 scope if work
          was added or removed after the sprint started.
        </p>
        {pointsQuery.isLoading ? <p className="muted">Loading points…</p> : null}
        {pointsQuery.isError ? <p className="form-error">Could not load points summary.</p> : null}
        {pointsQuery.data ? <BurndownChart summary={pointsQuery.data} /> : null}
        {!pointsQuery.isLoading && !selectedSprintId ? (
          <p className="muted">Select a sprint to chart burndown.</p>
        ) : null}
      </section>

      <section className="chart-section" aria-labelledby="burnup-heading">
        <h2 id="burnup-heading">Burnup</h2>
        {pointsQuery.data ? <BurnupChart summary={pointsQuery.data} /> : null}
        {!pointsQuery.isLoading && !selectedSprintId ? (
          <p className="muted">Select a sprint to chart burnup.</p>
        ) : null}
      </section>

      <section className="chart-section" aria-labelledby="cfd-heading">
        <h2 id="cfd-heading">Cumulative flow</h2>
        <CfdPlaceholder />
      </section>
    </div>
  );
}
