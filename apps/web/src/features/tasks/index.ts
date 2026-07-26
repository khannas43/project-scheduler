export {
  getTaskTree,
  patchTask,
  createTask,
  deleteTask,
  createDependency,
  deleteDependency,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignmentTimephased,
} from './api.js';
export type { AssignmentTimephasedRow } from './api.js';
export { ProjectDetailPage } from './components/ProjectDetailPage.js';
export { TaskGrid } from './components/TaskGrid.js';
export { GanttPanel } from './components/GanttPanel.js';
export { AssignmentPanel } from './components/AssignmentPanel.js';
export { CreateTaskModal } from './components/CreateTaskModal.js';
export { useTaskTree, tasksQueryKey } from './hooks/useTaskTree.js';
export { useTaskEdit, projectQueryKey } from './hooks/useTaskEdit.js';
export { useCreateTask } from './hooks/useCreateTask.js';
export { useDeleteTask } from './hooks/useDeleteTask.js';
export {
  useCreateDependency,
  useDeleteDependency,
  useSetTaskPredecessors,
} from './hooks/useDependencies.js';
export {
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useAssignmentTimephased,
  assignmentTimephasedQueryKey,
} from './hooks/useAssignments.js';
export { useUndoRedo } from './hooks/useUndoRedo.js';
export { useUndoStack, type UndoCommand, type TaskEditVariables } from './undoStack.js';
export { TaskIdAdapter } from './idAdapter.js';
export type {
  TaskRow,
  DependencyRow,
  AssignmentRow,
  CalendarRow,
  TaskTreeResponse,
  TaskMutationResponse,
  DependencyMutationResponse,
  TaskEditPatch,
} from './types.js';
