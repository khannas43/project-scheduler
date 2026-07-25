import { beforeEach, describe, expect, it } from 'vitest';

import { useUndoStack, type UndoCommand } from './undoStack.js';

function cmd(id: string, beforeName: string, afterName: string): UndoCommand {
  return {
    taskId: id,
    before: { name: beforeName },
    after: { name: afterName },
  };
}

describe('useUndoStack', () => {
  beforeEach(() => {
    useUndoStack.getState().clear();
    useUndoStack.getState().bindProject('proj-1');
  });

  it('pushes a command after a successful edit (pointer advances)', () => {
    useUndoStack.getState().push(cmd('t1', 'A', 'B'));
    expect(useUndoStack.getState().canUndo()).toBe(true);
    expect(useUndoStack.getState().canRedo()).toBe(false);
    expect(useUndoStack.getState().pointer).toBe(1);
    expect(useUndoStack.getState().history).toHaveLength(1);
  });

  it('truncates redo history on a new edit after an undo', () => {
    const { push, undo } = useUndoStack.getState();
    push(cmd('t1', 'A', 'B'));
    push(cmd('t1', 'B', 'C'));
    expect(useUndoStack.getState().history).toHaveLength(2);

    undo(); // back to after first edit
    expect(useUndoStack.getState().canRedo()).toBe(true);
    expect(useUndoStack.getState().pointer).toBe(1);

    // Fresh edit discards the redoable "C" command.
    useUndoStack.getState().push(cmd('t1', 'B', 'D'));
    expect(useUndoStack.getState().history.map((c) => c.after.name)).toEqual(['B', 'D']);
    expect(useUndoStack.getState().canRedo()).toBe(false);
    expect(useUndoStack.getState().pointer).toBe(2);
  });

  it('clears when projectId changes', () => {
    useUndoStack.getState().push(cmd('t1', 'A', 'B'));
    useUndoStack.getState().bindProject('proj-2');
    expect(useUndoStack.getState().history).toHaveLength(0);
    expect(useUndoStack.getState().canUndo()).toBe(false);
  });
});
