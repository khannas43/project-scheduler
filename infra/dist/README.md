# Project Scheduler — deploy (images only)

This folder is enough to run the app. You do not need the source repository.

## Requirements

- Docker Engine + Docker Compose
- Pull access to the two images named in `.env` (`SCHEDULER_API_IMAGE`, `SCHEDULER_WEB_IMAGE`)

## Start

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, JWT_SECRET, SEED_ADMIN_*, and the image names
docker compose -f compose.yaml up -d
```

Open `http://localhost:8081` (or the host/port you set as `WEB_PORT` / `CORS_ORIGIN`).

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Change that password after first login.

## What this starts

| Service | Role |
|---|---|
| `postgres` | Database (volume `pgdata`) |
| `migrate` | Applies schema, then exits |
| `seed` | Creates the admin user and system roles, then exits |
| `api` | Application API |
| `web` | UI (nginx). `/api` and `/health` are proxied to the API |

Postgres is not published to the host. Only the web port is.

## Stop / data

```bash
docker compose -f compose.yaml down          # keeps the database volume
docker compose -f compose.yaml down -v       # deletes all project data
```

## Notes

- Each team that deploys this gets their own database and their own admin.
- Do not share `.env`. Rotate `JWT_SECRET` and the admin password if they leak.
- Updates: pull newer image tags you are given, then `docker compose -f compose.yaml up -d`.
