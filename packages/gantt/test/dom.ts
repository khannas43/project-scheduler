import type { GanttView } from '../src/ganttView.js';

/** Chart body stack (sibling under the root, below the date header). */
export function chartStack(view: GanttView): HTMLElement {
  const root = view.container.firstElementChild as HTMLElement;
  return root.lastElementChild as HTMLElement;
}

export function stubStackRect(
  view: GanttView,
  size: { width: number; height: number } = { width: 800, height: 400 },
): HTMLElement {
  const stack = chartStack(view);
  Object.defineProperty(stack, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: size.width,
      height: size.height,
      right: size.width,
      bottom: size.height,
    }),
  });
  // Constructor resize() ran before the rect was stubbed — remeasure.
  window.dispatchEvent(new Event('resize'));
  return stack;
}
