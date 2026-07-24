import { GanttView, generateSyntheticProject } from '@pkg/gantt';

const params = new URLSearchParams(location.search);
const taskCount = Number(params.get('n') ?? 10_000);
const autobench = params.has('autobench');

const root = document.getElementById('gantt-root');
if (!root) throw new Error('#gantt-root missing');

const fpsEl = document.getElementById('fps');
const fpsWrap = fpsEl?.parentElement;
const taskCountEl = document.getElementById('task-count');
const depCountEl = document.getElementById('dep-count');
const scrollEl = document.getElementById('scroll');
const hoverEl = document.getElementById('hover');

const project = generateSyntheticProject(taskCount);
if (taskCountEl) taskCountEl.textContent = String(project.tasks.length);
if (depCountEl) depCountEl.textContent = String(project.dependencies.length);

const view = new GanttView({
  container: root,
  tasks: project.tasks,
  dependencies: project.dependencies,
  onHover: (id) => {
    if (hoverEl) hoverEl.textContent = id === null ? '—' : String(id);
  },
});

// --- Live FPS counter (rAF samples over a rolling 1s window) ---
const frameTimes: number[] = [];
let last = performance.now();
let frames = 0;
let fpsDisplay = 0;

function tick(now: number): void {
  const dt = now - last;
  last = now;
  frames += 1;
  frameTimes.push(dt);
  let windowMs = frameTimes.reduce((a, b) => a + b, 0);
  while (frameTimes.length > 1 && windowMs > 1000) {
    windowMs -= frameTimes.shift() ?? 0;
  }
  if (frames % 10 === 0 && frameTimes.length > 0 && windowMs > 0) {
    fpsDisplay = Math.round((frameTimes.length / windowMs) * 1000);
    if (fpsEl) fpsEl.textContent = String(fpsDisplay);
    if (fpsWrap) {
      fpsWrap.classList.remove('ok', 'warn', 'bad');
      fpsWrap.classList.add(fpsDisplay >= 50 ? 'ok' : fpsDisplay >= 30 ? 'warn' : 'bad');
    }
  }

  const vp = view.getViewport();
  if (scrollEl) {
    scrollEl.textContent = `${Math.round(vp.scrollLeft)}, ${Math.round(vp.scrollTop)}`;
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

declare global {
  interface Window {
    __ganttBenchmark?: {
      view: GanttView;
      fps: () => number;
      runAutoBench: () => Promise<{ avgFps: number; minFps: number; samples: number }>;
    };
  }
}

async function runAutoBench(): Promise<{ avgFps: number; minFps: number; samples: number }> {
  const samples: number[] = [];
  const durationMs = 3000;
  const start = performance.now();
  let lastSample = start;
  let localFrames = 0;

  // Continuous vertical + mild horizontal pan to stress all four layers.
  while (performance.now() - start < durationMs) {
    view.scrollBy(4, 28);
    view.paint();
    localFrames += 1;
    const now = performance.now();
    if (now - lastSample >= 100) {
      const fps = (localFrames / (now - lastSample)) * 1000;
      samples.push(fps);
      localFrames = 0;
      lastSample = now;
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  const avgFps = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const minFps = samples.length ? Math.min(...samples) : 0;
  return { avgFps, minFps, samples: samples.length };
}

window.__ganttBenchmark = {
  view,
  fps: () => fpsDisplay,
  runAutoBench,
};

if (autobench) {
  void (async () => {
    // Let the first layout/paint settle.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const result = await runAutoBench();
    const payload = {
      n: taskCount,
      avgFps: Number(result.avgFps.toFixed(1)),
      minFps: Number(result.minFps.toFixed(1)),
      samples: result.samples,
      target: 50,
      pass: result.avgFps >= 50,
    };
    document.title = `BENCH ${JSON.stringify(payload)}`;
    const pre = document.createElement('pre');
    pre.id = 'autobench-result';
    pre.textContent = JSON.stringify(payload, null, 2);
    pre.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:10;background:#111;color:#eee;padding:12px;border-radius:8px;font:12px/1.4 ui-monospace,monospace;max-width:360px;';
    document.body.appendChild(pre);
  })();
}
