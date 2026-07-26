import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { projectsApi } from '../../projects/index.js';
import { projectQueryKey, useTaskEdit } from '../hooks/useTaskEdit.js';
import { useTaskTree } from '../hooks/useTaskTree.js';
import { useUndoRedo } from '../hooks/useUndoRedo.js';
import type { TaskEditPatch, TaskRow } from '../types.js';
import { AssignmentPanel } from './AssignmentPanel.js';
import { GanttPanel } from './GanttPanel.js';
import { TaskGrid } from './TaskGrid.js';

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [assignTask, setAssignTask] = useState<TaskRow | null>(null);

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

  const { undo, redo, canUndo, canRedo } = useUndoRedo(projectId, edit.mutate, {
    enabled: Boolean(projectQuery.data && taskTree.data),
  });

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
  const { tasks, dependencies, assignments, projectVersion } = taskTree.data;

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
            {' · '}
            <Link to="/projects/$projectId/resources" params={{ projectId }}>
              Resources
            </Link>
            {' · '}
            <Link to="/projects/$projectId/baselines" params={{ projectId }}>
              Baselines
            </Link>
            {' · '}
            <Link to="/projects/$projectId/reports" params={{ projectId }}>
              Reports
            </Link>
          </p>
        </div>
        <div className="undo-redo-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={undo}
            disabled={!canUndo || edit.isPending}
            aria-keyshortcuts="Meta+Z Control+Z"
          >
            Undo
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={redo}
            disabled={!canRedo || edit.isPending}
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
          >
            Redo
          </button>
        </div>
      </header>

      <div className="project-detail-layout">
        <section className="project-detail-grid" aria-label="Task grid">
          <TaskGrid
            tasks={tasks}
            highlightedTaskId={highlightedTaskId}
            onEdit={onEdit}
            onAssignResources={setAssignTask}
            isEditing={edit.isPending}
          />
        </section>
        <section className="project-detail-gantt" aria-label="Gantt chart">
          <GanttPanel
            project={project}
            tasks={tasks}
            dependencies={dependencies}
            onHoverTask={setHighlightedTaskId}
            onCommitMove={onEdit}
            onCommitResize={onEdit}
          />
        </section>
      </div>

      {assignTask ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal assignment-modal" role="dialog" aria-modal="true">
            <AssignmentPanel
              projectId={projectId}
              task={assignTask}
              assignments={assignments}
              onClose={() => setAssignTask(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
