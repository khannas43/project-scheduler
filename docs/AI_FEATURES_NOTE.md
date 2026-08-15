# AI Features — Project Note

Status: **proposal / not yet implemented**. Not yet assigned a phase number in
`docs/adr/plan.md` — capturing the discussion and decisions so far before
scoping it into the build order.

## 1. Summary

Two candidate AI features, chosen because they bookend the same workflow —
one turns language into a real schedule, the other turns a real schedule back
into language:

1. **AI Schedule Narrator** — explains schedule metrics the app already
   computes (EV/SPI/CPI, burndown, velocity) in plain language.
2. **AI-Assisted Plan Generation** — turns a natural-language project
   description into a draft set of tasks and dependencies.

Both are designed to sit on top of existing engines (the EV/reporting
services, the CPM scheduler) rather than replace or bypass them.

## 2. Feature 1 — AI Schedule Narrator

| Aspect | Detail |
|---|---|
| Risk | Low — read-only, no writes to the schedule |
| Input | Output of existing services only (`reportDataService`, sprint points summary, EV metrics) — no new schema |
| Output | Prose explanation of numbers already on screen |
| API | New Fastify route, e.g. `POST /projects/:id/narrative` |
| Validation | Zod schema on request/response shape |
| Web | New component next to `AgileChartsPage` / EV dashboard; TanStack Query for fetch/cache |
| Cloud model | Claude API, `claude-opus-5` (or a lighter tier — this task doesn't need frontier reasoning) |
| Local model | `gemma4:e4b` (8B, already installed) — fast enough for a "hover and explain" UX; no structured-output needs |

## 3. Feature 2 — AI-Assisted Plan Generation

| Aspect | Detail |
|---|---|
| Risk | Higher — write-adjacent; bad LLM output (invalid deps, cycles) must never reach the schedule directly |
| Input | Natural-language project description |
| Output | Draft tasks + dependencies conforming to a strict JSON schema |
| Flow | **Generate → validate → user reviews/edits → confirm → normal task-creation API writes.** Never a silent auto-create. |
| Validation | Draft is run through the existing CPM engine's cycle-detection and constraint checks *before* it's shown as importable. Schema-valid ≠ logically-valid — a model can emit a well-formed but cyclic dependency graph, so the CPM check is mandatory, not optional. |
| API | New route producing a draft object (ephemeral or a lightweight `plan_drafts` table — TBD) |
| Web | New review/diff UI where the user edits/accepts before anything is committed |
| Cloud model | Claude API, `claude-opus-5`, using structured outputs (`output_config.format` / `client.messages.parse()`) to force schema-conformant JSON |
| Local model | `gemma4:26b` (26B, already installed) — chosen over an 8B/narrator-tier model because this task needs real multi-step reasoning about dependency correctness, and has confirmed `tools`/`thinking` capability. Ollama's `format: <json-schema>` (grammar-constrained decoding) gives genuine schema conformance locally, not just prompted-and-hoped-for JSON — same CPM validation step still applies regardless of provider. |

## 4. AI-mode toggle

- Off by default.
- Per-user (or per-workspace) setting — new field on the user/workspace
  settings table, mirrored in a Zustand store slice for session state.
- Gate must exist **server-side** on the API routes too, not just hide the UI
  — a client-side-only toggle is not a real gate.

## 5. Provider choice: Cloud (Claude) vs Local (Ollama)

- Exposed as a per-feature choice, not one global switch — the two features
  have different reliability requirements (see tables above), so "local for
  narrator, cloud for plan generation" is a legitimate configuration, not an
  inconsistency.
- Cloud: `@anthropic-ai/sdk`, `claude-opus-5`.
- Local: HTTP client against Ollama (`http://localhost:11434`).
- Menu visibility is driven by (4) + (5): AI-mode off → no AI menu entries at
  all; AI-mode on → provider submenu (Claude / Local), reflecting the current
  selection per feature.

## 6. Local model inventory (as of 2026-07-30, this dev machine)

Installed via Ollama:

| Model | Params | Size | Context | Capabilities |
|---|---|---|---|---|
| `gemma4:e4b` | 8.0B | 9.6 GB | 131K | completion, vision, audio, tools, thinking |
| `gemma4:26b` | 25.8B | 17 GB | 262K | completion, vision, tools, thinking |

- **Qwen is not installed** (checked Ollama, LM Studio, HuggingFace cache,
  common local dirs — no hits). Not pulled per explicit instruction ("don't
  install qwen3").
- Comparison research (Qwen3.x MoE vs Gemma 4 dense) came back mostly from
  SEO/blog sources, not primary benchmarks — treated as directional only, not
  a basis for an architecture decision. If a real comparison is wanted later,
  pull Qwen and benchmark both against this project's actual prompts on this
  machine.
- Dev machine: Apple M5, 32GB unified memory — comfortably runs both models
  now installed.

## 7. GPU / hardware note

- A discrete GPU is **not required**. Ollama runs on CPU-only, Apple
  Metal/unified memory, or discrete NVIDIA/AMD GPUs.
- Apple Silicon (this machine) shares one unified memory pool between CPU and
  GPU — Ollama uses the integrated GPU cores via Metal automatically, which
  is why `gemma4:26b` (17GB) already runs fine here.
- **Memory, not GPU presence, is the hard constraint.** A model roughly needs
  its file size in free memory to load; if it doesn't fit, it fails to load
  or gets offloaded to CPU/disk and becomes very slow.
- CPU-only fallback works but is slow — relevant if "offline mode" is ever
  used on a machine other than this one (older Intel Mac, budget Windows
  laptop). **Open question:** does offline mode assume a capable machine, or
  does it need a smaller fallback model for low-RAM/no-GPU environments?

## 8. Open questions / risks

- Per-feature vs. global provider toggle — leaning per-feature (see §5).
- Local JSON reliability for plan generation is mitigated by Ollama's
  grammar-constrained `format` option, but the CPM validation step remains
  mandatory regardless of provider.
- No fallback model chosen yet for low-spec offline deployments.
- Not yet scoped into `docs/adr/plan.md` phases or given a data model for
  plan drafts (ephemeral vs. persisted `plan_drafts` table).
