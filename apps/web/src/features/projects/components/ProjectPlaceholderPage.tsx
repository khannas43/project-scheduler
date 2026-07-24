import { Link, useParams } from '@tanstack/react-router';

/** Placeholder until the task grid / Gantt round. */
export function ProjectPlaceholderPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects">← Projects</Link>
          </p>
          <h1>Project</h1>
          <p className="lede mono">{projectId}</p>
        </div>
      </header>
      <div className="empty-state">
        <p>Task grid and Gantt land in the next round.</p>
      </div>
    </div>
  );
}
