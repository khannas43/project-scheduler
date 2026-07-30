export {
  ROW_HEIGHT,
  OVERSCAN,
  BAR_HEIGHT,
  HEADER_HEIGHT,
  PIXELS_PER_DAY,
  MINUTES_PER_DAY,
  RESIZE_EDGE_PX,
  SCALE_PIXELS_PER_DAY,
  pixelsPerMinuteForScale,
} from './constants.js';
export type { GanttTimeScale } from './constants.js';
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
export {
  drawTimeHeader,
  formatTickLabel,
  tickStepDays,
  dayIndexToUtcDate,
} from './layers/timeHeader.js';
export { drawArrows, lookupDependencyEndpoints } from './layers/arrows.js';
export type { ResolvedDependency } from './layers/arrows.js';
export { drawBars } from './layers/bars.js';
export { drawInteraction } from './layers/interaction.js';
export type { DragGhost } from './layers/interaction.js';
export { drawStatusDateLine } from './layers/statusDateLine.js';
export type { StatusDateLineDrawInput } from './layers/statusDateLine.js';
