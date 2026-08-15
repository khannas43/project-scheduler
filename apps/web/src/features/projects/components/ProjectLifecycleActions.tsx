import type { Project } from '../api.js';
import { useDeleteProject, useDuplicateProject, useSetProjectArchived } from '../hooks/useProjects.js';

export type ProjectLifecycleTarget = Pick<Project, 'id' | 'name' | 'version' | 'isArchived'>;

interface ProjectLifecycleActionsProps {
  readonly project: ProjectLifecycleTarget;
}

export function ProjectLifecycleActions({ project }: ProjectLifecycleActionsProps) {
  const setArchived = useSetProjectArchived();
  const del = useDeleteProject();
  const duplicate = useDuplicateProject();
  const busy = setArchived.isPending || del.isPending || duplicate.isPending;

  function onToggleDisabled() {
    const nextArchived = !project.isArchived;
    const verb = nextArchived ? 'Disable' : 'Enable';
    if (
      !window.confirm(
        `${verb} “${project.name}”?${
          nextArchived ? ' It will be hidden from the default project lists.' : ''
        }`,
      )
    ) {
      return;
    }
    void setArchived.mutateAsync({
      projectId: project.id,
      version: project.version,
      isArchived: nextArchived,
    });
  }

  function onDuplicate() {
    const suggested = `${project.name} (copy)`;
    const name = window.prompt('Name for the duplicated project:', suggested);
    if (name === null) return;
    const trimmed = name.trim();
    void duplicate.mutateAsync({
      projectId: project.id,
      ...(trimmed ? { name: trimmed } : {}),
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Permanently delete “${project.name}”? This cannot be undone and removes all tasks and schedule data.`,
      )
    ) {
      return;
    }
    void del.mutateAsync(project.id);
  }

  return (
    <div className="role-actions project-lifecycle-actions">
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        onClick={onDuplicate}
        data-testid={`project-duplicate-${project.id}`}
      >
        {duplicate.isPending ? 'Duplicating…' : 'Duplicate'}
      </button>
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        onClick={onToggleDisabled}
        data-testid={`project-disable-${project.id}`}
      >
        {project.isArchived ? 'Enable' : 'Disable'}
      </button>
      <button
        type="button"
        className="btn-link btn-danger-link"
        disabled={busy}
        onClick={onDelete}
        data-testid={`project-delete-${project.id}`}
      >
        Delete
      </button>
    </div>
  );
}
