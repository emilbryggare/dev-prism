# dev-session

Isolated parallel development sessions for any project. Run multiple Claude Code (or human) sessions on the same repo simultaneously—each with its own worktree and ports.

## How It Works

```
dev-session create 001
```

This single command:

1. **Creates a git worktree** at `../project-sessions/session-001`
2. **Generates `.env.session`** with deterministic ports (no collisions)
3. **Runs `docker compose up`** with those ports injected

That's it. All container orchestration lives in your standard `docker-compose.session.yml`—a file you control.

### Port Allocation

Each session gets its own port range, calculated deterministically:

```
port = portBase + (sessionId × 100) + offset
```

| Service       | Session 001 | Session 002 | Session 003 |
|---------------|-------------|-------------|-------------|
| APP_PORT      | 47100       | 47200       | 47300       |
| POSTGRES_PORT | 47110       | 47210       | 47310       |
| REDIS_PORT    | 47111       | 47211       | 47311       |

No port conflicts. No coordination needed between sessions.

### Two Modes

- **Docker mode** (default): Apps run in containers via `--profile apps`
- **Native mode**: Only infrastructure in Docker; run apps locally with `pnpm dev`

## Quick Start

```bash
# Install
pnpm add -D dev-session

# Create session (starts containers automatically)
dev-session create 001

# Other commands
dev-session list
dev-session stop 001
dev-session start 001
dev-session destroy 001
dev-session destroy --all
```

## Configuration

### session.config.mjs

```javascript
export default {
  portBase: 47000,
  sessionsDir: '../my-project-sessions',

  // Port offsets → env vars for docker-compose
  ports: {
    APP_PORT: 0,
    POSTGRES_PORT: 10,
    REDIS_PORT: 11,
  },

  // Optional: env vars for running apps on host (native mode)
  appEnv: {
    'apps/my-app': {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/postgres',
    },
  },

  setup: ['pnpm install', 'pnpm db:push'],
};
```

### docker-compose.session.yml

Standard Docker Compose with `${VAR}` placeholders:

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

  my-app:
    profiles: ["apps"]  # Only in docker mode
    build: .
    container_name: my-app-${SESSION_ID}
    ports:
      - "${APP_PORT}:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
    depends_on:
      - postgres
```

## Generated Files

```
session-001/
├── .env.session              # Ports for docker-compose
└── apps/my-app/.env.session  # App env for native mode (if configured)
```

Example `.env.session`:
```bash
SESSION_ID=001
APP_PORT=47100
POSTGRES_PORT=47110
REDIS_PORT=47111
```
