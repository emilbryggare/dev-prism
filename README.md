# dev-prism

<p align="center">
  <img src="banner.png" alt="dev-prism - One codebase, many parallel sessions" width="600">
</p>

A minimal CLI tool for managing isolated parallel development sessions. Enables multiple Claude Code (or human developer) sessions to work on the same repo simultaneously with complete isolation.

## Philosophy

**Stateless orchestration, Docker as source of truth.** This tool does the bare minimum:
1. Creates git worktrees for isolated working directories
2. Generates `docker-compose.session.yml` with random port bindings
3. Runs `docker compose` commands
4. Discovers ports from running containers and writes `.env.session`

No database, no state tracking—everything is derived from Docker's reality.

## Features

- **Stateless** - No database, Docker is the single source of truth
- **Git worktrees** for isolated working directories (or in-place mode)
- **Docker Compose** handles all container orchestration
- **Random port allocation** via Docker (zero conflicts)
- **Automatic port discovery** from running containers
- **Auto-healing** - commands always sync to Docker reality
- **Two modes**: Docker (apps in containers) or Native (apps run locally)
- **Claude Code integration** built-in (`dev-prism claude`)
- **Portable**: Works with any project

## Installation

```bash
npm install -g dev-prism
# or
pnpm add -D dev-prism
```

## Quick Start

```bash
# Create a session with worktree
dev-prism create

# Or create in current directory
dev-prism create --in-place

# List active sessions
dev-prism list

# Check current directory status
dev-prism info

# Stop session in current directory
dev-prism stop

# Destroy session in current directory
dev-prism destroy
```

## Usage

### Create a session

```bash
# Create with worktree (generates timestamp-based branch)
dev-prism create

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

Shows only running sessions with their ports and container counts.

### Session info

```bash
# Show info for current directory
dev-prism info

# Or specify directory
dev-prism info /path/to/session
```

### Start/Stop services

```bash
# Stop session in current directory
dev-prism stop

# Or specify directory
dev-prism stop /path/to/session

# Stop all running sessions
dev-prism stop-all

# Start stopped session
dev-prism start
```

### View logs

```bash
# Stream logs from current directory
dev-prism logs

# Or specify directory
dev-prism logs /path/to/session
```

### Cleanup

```bash
# Destroy session in current directory
dev-prism destroy

# Or specify directory
dev-prism destroy /path/to/session

# Destroy all sessions
dev-prism destroy --all

# Remove all stopped session directories
dev-prism prune
dev-prism prune -y  # Skip confirmation
```

### Claude Code integration

```bash
dev-prism claude          # Install Claude Code skill + CLAUDE.md
dev-prism claude --force  # Overwrite existing files
```

## Architecture

### Stateless Design

dev-prism v0.6+ has **zero persistent state**. Every command queries Docker to understand current reality:

```bash
# Session discovery
docker ps --filter "label=dev-prism.managed=true"

# Session identity = working directory path
# Stored in container label: dev-prism.working_dir=/path/to/session
```

### Port Management

Ports are **randomly assigned by Docker** and **discovered after startup**:

1. Generate `docker-compose.session.yml` with `"0:5432"` (random host port)
2. Start containers: `docker compose up -d`
3. Inspect containers: `docker inspect` to get actual ports
4. Write `.env.session` with discovered ports

Example discovered ports:
```bash
POSTGRES_PORT=54321  # Random
APP_PORT=32768       # Random
WEB_PORT=32769       # Random
```

**Why random ports?**
- Zero configuration
- Docker handles conflicts automatically
- Large ephemeral port range (32768-60999)
- Simpler than centralized allocation

### Auto-Healing

Commands always reflect Docker's current state:

```bash
# If .env.session is deleted, it regenerates from Docker
dev-prism info  # Queries Docker, recreates .env.session

# If containers are manually removed, session disappears from list
dev-prism list  # Only shows what Docker reports

# If containers exist but .env.session is missing, file is recreated
```

No warnings, no errors, no stale state—just current reality.

## Configuration

### session.config.mjs

```javascript
export default {
  // Project name for Docker namespace (defaults to directory name)
  projectName: 'myproject',

  // Where to create worktrees (relative to project root)
  sessionsDir: '../my-project-sessions',

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

### docker-compose.yml (your base services)

Define your services as usual:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    profiles: ["app"]  # Only runs in docker mode
    build:
      context: .
      dockerfile: apps/my-app/Dockerfile.dev
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
    depends_on:
      postgres:
        condition: service_healthy
```

### Generated docker-compose.session.yml

dev-prism generates this automatically with random ports and labels:

```yaml
# Auto-generated by dev-prism - DO NOT EDIT
version: "3.8"

x-dev-prism-labels: &dev-prism-labels
  dev-prism.managed: "true"
  dev-prism.working_dir: "/Users/you/worktrees/session-2026-02-06T12-30-45"
  dev-prism.session_id: "/Users/you/worktrees/session-2026-02-06T12-30-45"
  dev-prism.created_at: "2026-02-06T12:30:45.123Z"

services:
  postgres:
    extends:
      file: docker-compose.yml
      service: postgres
    ports:
      - "0:5432"  # Random host port
    labels:
      <<: *dev-prism-labels
      dev-prism.service: "postgres"
      dev-prism.internal_port: "5432"

  app:
    extends:
      file: docker-compose.yml
      service: app
    ports:
      - "0:3000"  # Random host port
    labels:
      <<: *dev-prism-labels
      dev-prism.service: "app"
      dev-prism.internal_port: "3000"
```

## How It Works

1. **Create session**: `dev-prism create`
   - Checks for existing session in directory via Docker labels
   - Creates git worktree (or uses current dir with `--in-place`)
   - Generates `docker-compose.session.yml` with random port bindings (`"0:5432"`)
   - Writes `.env.session` stub with compose project name
   - Runs `docker compose up -d`
   - Inspects running containers to discover actual ports
   - Updates `.env.session` with discovered ports
   - Runs setup commands

2. **Port discovery**
   - Query containers: `docker inspect <container-id>`
   - Extract `NetworkSettings.Ports` mappings
   - Write discovered ports to `.env.session`

3. **Session identity**
   - Session ID = full working directory path
   - Stored in container labels: `dev-prism.working_dir=/path/to/session`
   - One session per directory maximum

4. **List sessions**: `dev-prism list`
   - Query Docker: `docker ps --filter label=dev-prism.managed=true`
   - Group by `working_dir` label
   - Show only running sessions

5. **Stop session**: `dev-prism stop`
   - Find containers via labels
   - Run `docker compose stop`
   - Delete `.env.session` file

## Generated Files

```
session-2026-02-06T12-30-45/
├── .env.session               # Discovered ports (gitignored)
├── docker-compose.session.yml # Generated compose file (gitignored)
└── apps/my-app/.env.session   # App-specific env (gitignored)
```

Example `.env.session` (after port discovery):
```bash
# Auto-generated by dev-prism
COMPOSE_PROJECT_NAME=myproject-a1b2c3d4
SESSION_DIR=/Users/you/worktrees/session-2026-02-06T12-30-45

# Discovered ports from running containers
POSTGRES_PORT=54321
APP_PORT=32768
WEB_PORT=32769
```

Add to `.gitignore`:
```
.env.session
docker-compose.session.yml
```

## Portability

To use in another project:

1. Install: `pnpm add -D dev-prism`
2. Create `session.config.mjs` (optional, has defaults)
3. Define services in `docker-compose.yml`
4. Run `dev-prism create`

dev-prism generates `docker-compose.session.yml` automatically—you never need to write it.

## Migration from v0.5.x

v0.6.0 is a breaking change with a new stateless architecture:

**What changed:**
- Session IDs: `001, 002, 003` → full directory paths
- Port allocation: calculated → random (Docker assigns)
- State storage: SQLite database → stateless (Docker labels)
- Commands: `dev-prism stop 001` → `dev-prism stop` (uses cwd)

**Migration steps:**
1. Stop all v0.5 sessions: `dev-prism stop-all` (on v0.5.x)
2. Upgrade to v0.6: `pnpm add -g dev-prism@0.6`
3. Recreate sessions as needed

Old session directories can be deleted manually if no longer needed.

## Why Stateless?

**Problems with v0.5.x database approach:**
- State could diverge from Docker reality (manual container removal)
- Required reconciliation logic
- Database was single point of failure
- Stored data that Docker already knows

**v0.6+ stateless benefits:**
- Docker is always the source of truth
- No state sync issues
- Survives `docker system prune`
- Simpler codebase (fewer abstractions)
- Auto-heals on every command
- Zero configuration for port conflicts

## Troubleshooting

**"No session found in this directory"**
- Session only exists when containers are running
- Run `dev-prism create` to start a new session

**"Session already running in this directory"**
- Containers are already running here
- Use `dev-prism stop` first, then `dev-prism create` again

**Ports not in .env.session**
- Run `dev-prism info` to regenerate from Docker

**Want predictable ports?**
- Override in your `docker-compose.yml`: `ports: ["5432:5432"]`
- Trade-off: potential conflicts across sessions

## License

MIT
