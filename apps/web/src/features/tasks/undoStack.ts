import { create } from 'zustand';

import type { TaskEditPatch, TaskRow } from './types.js';

const MAX_STACK = 50;

/** Fields that participate in undo/redo (excludes taskId / version). */
export type TaskEditFields = {
  readonly name?: string;
  readonly durationMinutes?: number | null;
};

export interface UndoCommand {
  readonly taskId: string;
  readonly before: TaskEditFields;
  readonly after: TaskEditFields;
}

export type TaskEditSource = 'user' | 'undo' | 'redo';

export type TaskEditVariables = TaskEditPatch & {
  readonly source?: TaskEditSource;
};

interface UndoStackState {
  projectId: string | null;
  /** Linear history; pointer splits undoable [0, pointer) from redoable [pointer, length). */
  history: UndoCommand[];
  pointer: number;
  bindProject: (projectId: string) => void;
  clear: () => void;
  push: (command: UndoCommand) => void;
  /** Move pointer back; returns the command to reverse, or null. */
  undo: () => UndoCommand | null;
  /** Move pointer forward; returns the command to re-apply, or null. */
  redo: () => UndoCommand | null;
  /** Restore pointer after a failed undo mutation. */
  cancelUndo: () => void;
  /** Restore pointer after a failed redo mutation. */
  cancelRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useUndoStack = create<UndoStackState>((set, get) => ({
  projectId: null,
  history: [],
  pointer: 0,

  bindProject: (projectId) => {
    const current = get().projectId;
    if (current === projectId) return;
    set({ projectId, history: [], pointer: 0 });
  },

  clear: () => set({ projectId: null, history: [], pointer: 0 }),

  push: (command) => {
    const { history, pointer } = get();
    const truncated = history.slice(0, pointer);
    truncated.push(command);
    const next =
      truncated.length > MAX_STACK ? truncated.slice(truncated.length - MAX_STACK) : truncated;
    set({ history: next, pointer: next.length });
  },

  undo: () => {
    const { history, pointer } = get();
    if (pointer <= 0) return null;
    const command = history[pointer - 1];
    if (!command) return null;
    set({ pointer: pointer - 1 });
    return command;
  },

  redo: () => {
    const { history, pointer } = get();
    if (pointer >= history.length) return null;
    const command = history[pointer];
    if (!command) return null;
    set({ pointer: pointer + 1 });
    return command;
  },

  cancelUndo: () => {
    const { history, pointer } = get();
    if (pointer >= history.length) return;
    set({ pointer: pointer + 1 });
  },

  cancelRedo: () => {
    const { pointer } = get();
    if (pointer <= 0) return;
    set({ pointer: pointer - 1 });
  },

  canUndo: () => get().pointer > 0,
  canRedo: () => get().pointer < get().history.length,
}));

/** Capture only fields present on the outbound patch. */
export function captureAfterFields(patch: TaskEditPatch): TaskEditFields {
  const after: { name?: string; durationMinutes?: number | null } = {};
  if (patch.name !== undefined) after.name = patch.name;
  if (patch.durationMinutes !== undefined) after.durationMinutes = patch.durationMinutes;
  return after;
}

export function captureBeforeFields(task: TaskRow, patch: TaskEditPatch): TaskEditFields {
  const before: { name?: string; durationMinutes?: number | null } = {};
  if (patch.name !== undefined) before.name = task.name;
  if (patch.durationMinutes !== undefined) before.durationMinutes = task.durationMinutes;
  return before;
}

export function buildUndoCommand(
  task: TaskRow,
  patch: TaskEditPatch,
): UndoCommand | null {
  const after = captureAfterFields(patch);
  if (after.name === undefined && after.durationMinutes === undefined) {
    return null;
  }
  return {
    taskId: patch.taskId,
    before: captureBeforeFields(task, patch),
    after,
  };
}

/** Exported for tests that need to reset between cases. */
export const UNDO_STACK_MAX = MAX_STACK;
