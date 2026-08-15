# SonarQube (local) + CI quality gate

This repo targets your **self-hosted SonarQube** at [http://localhost:9012](http://localhost:9012) (Docker `docker-sonarqube-1`, host port **9012** → container 9000).

GitHub Actions cannot reach `localhost` on your laptop. For **PR quality gates in GitHub**, either:

1. Point `SONAR_HOST_URL` at a SonarQube URL reachable from the internet (or a self-hosted runner on your LAN), or  
2. Use [SonarCloud](https://sonarcloud.io) with the same `sonar-project.properties` (change host / token only).

Local scans always work against `:9012`.

**Apple Silicon note:** the official `sonarsource/sonar-scanner-cli` Docker image is **amd64-only**. `pnpm sonar` uses the host-native `sonarqube-scanner` npm package (or `brew install sonar-scanner` if present). Do not force `--platform linux/arm64` — that image does not exist.

**If the JS/TS sensor hangs on “Resolving provided TSConfig”:** macOS/Finder often creates duplicate `* 2` / `* 3` copies under `node_modules` (thousands of them). They stall TypeScript program loading. Remove them, then re-run:

```bash
# dry-run
find node_modules apps/*/node_modules packages/*/node_modules \( -name '* 2' -o -name '* 3' \) 2>/dev/null | head

# remove (safe: only Finder-style duplicates)
find node_modules apps packages \( -path '*/node_modules/*' \) \( -name '* 2' -o -name '* 3' \) -print0 2>/dev/null \
  | xargs -0 rm -rf
pnpm sonar
```

Analysis uses `tsconfig.sonar.json` (pinned in `sonar-project.properties`) so the scanner does not walk nested git worktrees.

---

## One-time SonarQube UI / API setup (you must do this)

SonarQube is **UP**, but default `admin`/`admin` is **not** valid on this instance (password already changed). Log in at http://localhost:9012/projects and complete:

### 1. Create the project

- **Create project** → **Local project** (or Manual)
- **Project display name:** `Project Scheduler`
- **Project key:** `project-scheduler` (must match `sonar-project.properties`)
- **Main branch:** `main`
- Skip the tutorial if offered; we use `pnpm sonar` (native scanner) / CI action

Or via API (replace `USER` / `PASS` or use a token as username with empty password):

```bash
curl -u 'USER:PASS' -X POST 'http://localhost:9012/api/projects/create' \
  -d 'name=Project%20Scheduler&project=project-scheduler&mainBranch=main'
```

### 2. Generate an analysis token

- **My Account** → **Security** → **Generate Tokens**
- Name e.g. `project-scheduler-local`
- Type: **User Token** (or Global Analysis Token on newer editions)
- Copy `squ_…` into `.env.sonar` from `sonar.env.example`:

```bash
cp sonar.env.example .env.sonar
# edit SONAR_TOKEN=
```

### 3. Quality gate

- **Quality Gates** → keep **Sonar way** as default, **or** clone it to `project-scheduler` and attach it to the project
- Recommended first pass: leave Sonar way; after a baseline scan, tighten if needed
- Attach gate: Project → **Project Settings** → **Quality Gate**

### 4. (Optional) New Code period

- Project → **Project Settings** → **New Code** → **Previous version** or **Number of days** (e.g. 30)
- Helps PR / “new code” metrics once CI sends `sonar.pullrequest.*`

### 5. GitHub PR decoration (optional)

Self-hosted SonarQube needs a **GitHub App / ALM integration** configured under **Administration → DevOps Platform Integrations → GitHub**, plus a publicly reachable Sonar URL (or self-hosted runner). Without that, CI still **fails the job** when the quality gate is `ERROR` / `FAILED`, which is enough for a required check.

---

## Local scan

```bash
cp sonar.env.example .env.sonar   # once
# set SONAR_TOKEN in .env.sonar

pnpm sonar
# or: ./scripts/sonar-scan.sh
```

This runs `pnpm test:coverage`, then the host-native scanner (`sonar-scanner` or `sonarqube-scanner` npm), then polls the project quality gate. Docker CLI is only a fallback on amd64 hosts.

Dashboard: http://localhost:9012/dashboard?id=project-scheduler

---

## GitHub Actions

Workflow job **`sonar`** (see `.github/workflows/ci.yml`):

| Secret | Purpose |
|--------|---------|
| `SONAR_TOKEN` | Analysis token |
| `SONAR_HOST_URL` | e.g. `https://sonar.example.com` — **not** `http://localhost:9012` for github.com-hosted runners |

If secrets are missing, the Sonar job is **skipped** (CI lint/test/build still run).

After the first green Sonar check appears, mark **`sonar`** (or `SonarQube Quality Gate`) as a **required status check** on `main` in GitHub → Settings → Branches.

---

## Files

| Path | Role |
|------|------|
| `sonar-project.properties` | Project key, sources, exclusions, LCOV paths |
| `scripts/sonar-scan.sh` | Local scan + gate wait |
| `sonar.env.example` | Template for `.env.sonar` |
