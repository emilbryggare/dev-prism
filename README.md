# dev-prism

<p align="center">
  <img src="banner.png" alt="dev-prism - One codebase, many parallel sessions" width="600">
</p>

A minimal CLI tool for managing isolated parallel development sessions. Enables multiple Claude Code (or human developer) sessions to work on the same repo simultaneously with complete isolation.

## Philosophy

**Minimal orchestration, maximal Docker Compose.** This tool does the bare minimum:
1. Creates git worktrees for isolated working directories
2. Generates `.env.session` with calculated ports
3. Runs `docker compose` commands

All Docker configuration lives in `docker-compose.session.yml` in your project - a standard file you control.

## Features

- **Git worktrees** for isolated working directories (or in-place mode)
- **Docker Compose** handles all container orchestration
- **Unique ports** per session (calculated from session ID, displayed as clickable URLs)
- **Auto-assign** session IDs or choose your own
- **SQLite tracking** — all sessions stored in a local database
- **Two modes**: Docker (apps in containers) or Native (apps run locally)
- **Claude Code integration** built-in (`dev-prism claude`)
- **Portable**: Works with any project

## Installation

```bash
npm install -g dev-prism
# or
pnpm add -D dev-prism
```

## Usage

### Create a session

```bash
# Auto-assign session ID
dev-prism create

# Explicit session ID
dev-prism create 001

# Custom branch name
dev-prism create --branch feature/my-feature

# Native mode - only infrastructure in Docker, apps run via pnpm dev
dev-prism create --mode native

# Exclude specific apps from Docker
dev-prism create --without web,widget

# In-place mode - use current directory instead of creating worktree
dev-prism create --in-place

# Stream logs after creation instead of detaching
dev-prism create --no-detach
```

### List sessions

```bash
dev-prism list
```

### Session info (for current directory)

```bash
dev-prism info
```

### Start/Stop services

```bash
dev-prism stop 001   # Stop without destroying
dev-prism start 001  # Start again
dev-prism stop-all   # Stop all sessions
```

### View logs

```bash
dev-prism logs 001
```

### Cleanup

```bash
dev-prism destroy 001     # Destroy specific session
dev-prism destroy --all   # Destroy all sessions
dev-prism prune           # Remove all stopped sessions
dev-prism prune -y        # Skip confirmation
```

### Claude Code integration

```bash
dev-prism claude          # Install Claude Code skill + CLAUDE.md
dev-prism claude --force  # Overwrite existing files
```

## Port Allocation

Formula: `port = portBase + (sessionId * 100) + offset`

With base port 47000:

| Service        | Session 001 | Session 002 | Session 003 |
|----------------|-------------|-------------|-------------|
| APP_PORT       | 47100       | 47200       | 47300       |
| WEB_PORT       | 47101       | 47201       | 47301       |
| POSTGRES_PORT  | 47110       | 47210       | 47310       |
| MAILPIT_SMTP   | 47111       | 47211       | 47311       |
| MAILPIT_WEB    | 47112       | 47212       | 47312       |

## Configuration

### session.config.mjs

```javascript
export default {
  // Required
  portBase: 47000,
  sessionsDir: '../my-project-sessions',

  // Port offsets - become env vars for docker-compose
  // Formula: portBase + (sessionId * 100) + offset
  ports: {
    APP_PORT: 0,        // 47100, 47200, 47300...
    WEB_PORT: 1,        // 47101, 47201, 47301...
    POSTGRES_PORT: 10,  // 47110, 47210, 47310...
    REDIS_PORT: 11,     // 47111, 47211, 47311...
  },

  // Docker Compose profiles for app containers (used in docker mode)
  // These match service names with `profiles: ["app-name"]` in docker-compose
  apps: ['app', 'web'],

  // .env files to copy to session worktree (DATABASE_URL auto-updated)
  envFiles: [
    'apps/my-app/.env',
    'packages/db/.env',
  ],

  // Commands to run after session creation
  setup: ['pnpm install', 'pnpm db:push'],

  // Optional: app-specific env for CLI commands from host (native mode)
  appEnv: {
    'apps/my-app': {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/postgres',
    },
  },
};
```

### docker-compose.session.yml (standard Docker Compose)

```yaml
services:
  postgres:
    image: postgres:16
    container_name: postgres-${SESSION_ID}
    ports:
      - "${POSTGRES_PORT}:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  my-app:
    profiles: ["apps"]  # Only runs in docker mode
    build:
      context: .
      dockerfile: apps/my-app/Dockerfile.dev
    container_name: my-app-${SESSION_ID}
    ports:
      - "${APP_PORT}:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
    depends_on:
      postgres:
        condition: service_healthy
```

## How It Works

1. **Create session**: `dev-prism create`
   - Auto-assigns next available session ID (or use explicit ID)
   - Creates git worktree at `../project-sessions/session-001` (or uses current dir with `--in-place`)
   - Generates `.env.session` with calculated ports
   - Records session in local SQLite database
   - Runs `docker compose --env-file .env.session up -d`
   - Runs setup commands

2. **Docker Compose** reads `.env.session` and substitutes `${VAR}` placeholders

3. **Docker mode** (`--profile apps`): All services including apps run in containers
4. **Native mode**: Only infrastructure runs; apps use `pnpm dev` with `.env.session`

All session state is tracked in a SQLite database (`~/.dev-prism/sessions.db`), making both worktree and in-place sessions first-class citizens across all commands.

## Generated Files

```
session-001/
├── .env.session              # Port variables for docker-compose
├── docker-compose.session.yml # (from git, not generated)
└── apps/my-app/.env.session  # App-specific env for host CLI
```

Example `.env.session`:
```bash
SESSION_ID=001
POSTGRES_PORT=47110
MAILPIT_SMTP_PORT=47111
MAILPIT_WEB_PORT=47112
APP_PORT=47100
```

## Portability

To use in another project:

1. Install: `pnpm add -D dev-prism`
2. Create `session.config.mjs` with port offsets
3. Create `docker-compose.session.yml` with `${VAR}` placeholders
4. Run `dev-prism create`
