export {
  ROW_HEIGHT,
  OVERSCAN,
  BAR_HEIGHT,
  PIXELS_PER_DAY,
  MINUTES_PER_DAY,
  RESIZE_EDGE_PX,
} from './constants.js';
export type { GanttTask, GanttDependency, ViewportState, TimeScale } from './types.js';
export { visibleRowRange, isBarInTimeWindow, minutesToX, xToMinutes } from './viewport.js';
export type { VisibleRowRange, VisibleRowRangeInput } from './viewport.js';
export { STRIDE, buildSpatialIndex, hitTest } from './hitTest.js';
export type { SpatialBar } from './hitTest.js';
export { generateSyntheticProject } from './synthetic.js';
export type { SyntheticProject } from './synthetic.js';
export { buildTaskById, lookupTask } from './taskIndex.js';
export { snapMinutesToDay, snapDurationMinutes } from './drag.js';
export { GanttView } from './ganttView.js';
export type { GanttViewOptions } from './ganttView.js';
export { drawBackground } from './layers/background.js';
export { drawArrows, lookupDependencyEndpoints } from './layers/arrows.js';
export type { ResolvedDependency } from './layers/arrows.js';
export { drawBars } from './layers/bars.js';
export { drawInteraction } from './layers/interaction.js';
export type { DragGhost } from './layers/interaction.js';
