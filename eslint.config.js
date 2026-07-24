// @ts-check
const path = require('node:path');
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');

// Every package's own `lint` script runs `eslint .` with cwd set to that
// package's directory (this is how turbo/pnpm invoke it per-workspace), so
// any relative path here would resolve against the wrong cwd depending on
// who's invoking. Anchor everything to this config file's location instead.
const ROOT = __dirname;
const abs = (...segments) => path.join(ROOT, ...segments);

// Dependency graph — TECHNICAL_DESIGN.md §2.1:
//   web       -> schema, gantt, scheduler, rbac, ui
//   api       -> schema, scheduler, rbac
//   scheduler -> (nothing)
//   schema    -> zod only
//   rbac      -> schema
//   gantt     -> schema
//   ui        -> (unspecified; treated as forbidden from importing apps, like every other package)
const zones = [
  {
    target: abs('packages/scheduler'),
    from: [abs('apps'), abs('packages/schema'), abs('packages/gantt'), abs('packages/rbac'), abs('packages/ui')],
    message: 'packages/scheduler is a pure, zero-dependency package (§1.2) — it may not import from any other workspace package or app.',
  },
  {
    target: abs('packages/schema'),
    from: [abs('apps'), abs('packages/scheduler'), abs('packages/gantt'), abs('packages/rbac'), abs('packages/ui')],
    message: 'packages/schema may depend on zod only (§2.1) — no other workspace package or app.',
  },
  {
    target: abs('packages/rbac'),
    from: [abs('apps'), abs('packages/scheduler'), abs('packages/gantt'), abs('packages/ui')],
    message: 'packages/rbac may depend on @pkg/schema only (§2.1).',
  },
  {
    target: abs('packages/gantt'),
    from: [abs('apps'), abs('packages/scheduler'), abs('packages/rbac'), abs('packages/ui')],
    message: 'packages/gantt may depend on @pkg/schema only (§2.1).',
  },
  {
    target: abs('packages/ui'),
    from: [abs('apps')],
    message: 'packages/ui may not depend on an app (§2.1 — dependencies flow from apps to packages, never the reverse).',
  },
  {
    target: abs('apps/api'),
    from: [abs('apps/web'), abs('packages/gantt'), abs('packages/ui')],
    message: 'apps/api may depend on schema, scheduler, and rbac only (§2.1) — not gantt, ui, or web.',
  },
  {
    target: abs('apps/web'),
    from: [abs('apps/api')],
    message: 'apps/web may not depend on apps/api (§2.1).',
  },
];

module.exports = tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: [
            abs('packages/*/tsconfig.json'),
            abs('apps/*/tsconfig.json'),
          ],
        },
      },
    },
    rules: {
      'import/no-restricted-paths': ['error', { zones }],
    },
  },
  {
    // §1.2: scheduler is pure — no imports of any kind outside itself,
    // including npm packages (date-fns, lodash) and Node builtins.
    // Relative imports within the package (./, ../) are unaffected.
    files: ['packages/scheduler/**/*.ts', 'packages/scheduler/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Matches anything that isn't a relative import (./ or ../).
              regex: '^(?!\\.{1,2}/)',
              message: 'packages/scheduler must not import anything outside itself (§1.2) — no npm packages, no Node builtins.',
            },
          ],
        },
      ],
    },
  },
);
