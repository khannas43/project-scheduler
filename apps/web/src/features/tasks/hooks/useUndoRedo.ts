import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import type { TaskTreeResponse } from '../types.js';
import { useUndoStack, type TaskEditVariables } from '../undoStack.js';
import { tasksQueryKey } from './useTaskTree.js';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Undo/redo for task edits on the project detail page.
 * Clears the stack when projectId changes or the page unmounts.
 */
export function useUndoRedo(
  projectId: string,
  mutate: (vars: TaskEditVariables) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  const pointer = useUndoStack((s) => s.pointer);
  const historyLen = useUndoStack((s) => s.history.length);
  const canUndo = pointer > 0;
  const canRedo = pointer < historyLen;

  useEffect(() => {
    useUndoStack.getState().bindProject(projectId);
    return () => {
      useUndoStack.getState().clear();
    };
  }, [projectId]);

  const undo = useCallback(() => {
    if (!enabled) return;
    const command = useUndoStack.getState().undo();
    if (!command) return;

    const tree = queryClient.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    const task = tree?.tasks.find((t) => t.id === command.taskId);
    if (!task) {
      useUndoStack.getState().cancelUndo();
      return;
    }

    mutate({
      taskId: command.taskId,
      version: task.version,
      ...command.before,
      source: 'undo',
    });
  }, [enabled, mutate, projectId, queryClient]);

  const redo = useCallback(() => {
    if (!enabled) return;
    const command = useUndoStack.getState().redo();
    if (!command) return;

    const tree = queryClient.getQueryData<TaskTreeResponse>(tasksQueryKey(projectId));
    const task = tree?.tasks.find((t) => t.id === command.taskId);
    if (!task) {
      useUndoStack.getState().cancelRedo();
      return;
    }

    mutate({
      taskId: command.taskId,
      version: task.version,
      ...command.after,
      source: 'redo',
    });
  }, [enabled, mutate, projectId, queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== 'z') return;

      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, undo, redo]);

  return { undo, redo, canUndo, canRedo };
}
