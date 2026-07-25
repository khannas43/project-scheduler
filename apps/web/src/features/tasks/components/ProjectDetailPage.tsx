import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { projectsApi } from '../../projects/index.js';
import { projectQueryKey, useTaskEdit } from '../hooks/useTaskEdit.js';
import { useTaskTree } from '../hooks/useTaskTree.js';
import type { TaskEditPatch } from '../types.js';
import { GanttPanel } from './GanttPanel.js';
import { TaskGrid } from './TaskGrid.js';

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => projectsApi.getProject(projectId),
  });

  const taskTree = useTaskTree(projectId);
  const edit = useTaskEdit(projectId);

  const onEdit = useCallback(
    (patch: TaskEditPatch) => {
      edit.mutate(patch);
    },
    [edit.mutate],
  );

  if (projectQuery.isLoading || taskTree.isLoading) {
    return (
      <div className="page project-detail-page">
        <p className="muted">Loading project…</p>
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="page project-detail-page">
        <p className="form-error">Could not load project.</p>
        <Link to="/projects">← Back to projects</Link>
      </div>
    );
  }

  if (taskTree.isError || !taskTree.data) {
    return (
      <div className="page project-detail-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              <Link to="/projects">← Projects</Link>
            </p>
            <h1>{projectQuery.data.name}</h1>
          </div>
        </header>
        <p className="form-error">Could not load tasks.</p>
      </div>
    );
  }

  const project = projectQuery.data;
  const { tasks, dependencies, projectVersion } = taskTree.data;

  return (
    <div className="page project-detail-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/projects">← Projects</Link>
          </p>
          <h1>{project.name}</h1>
          <p className="lede muted">
            Version <span className="mono">{projectVersion}</span>
            {project.status ? <> · {project.status}</> : null}
            {' · '}
            <Link to="/projects/$projectId/roles" params={{ projectId }}>
              Manage roles
            </Link>
          </p>
        </div>
      </header>

      <div className="project-detail-layout">
        <section className="project-detail-grid" aria-label="Task grid">
          <TaskGrid
            tasks={tasks}
            highlightedTaskId={highlightedTaskId}
            onEdit={onEdit}
            isEditing={edit.isPending}
          />
        </section>
        <section className="project-detail-gantt" aria-label="Gantt chart">
          <GanttPanel
            project={project}
            tasks={tasks}
            dependencies={dependencies}
            onHoverTask={setHighlightedTaskId}
          />
        </section>
      </div>
    </div>
  );
}
