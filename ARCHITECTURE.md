# dev-prism Architecture

## Overview

dev-prism is a **port allocator, env injector, and worktree manager** for parallel development sessions. It uses SQLite as the source of truth for port allocation and provides `with-env` as the universal interface for injecting session-specific environment variables into any command.

## Design Philosophy

### Core Principle: Allocate Ports, Inject Env, Get Out of the Way

dev-prism has three responsibilities:
1. **Port allocation** — SQLite with UNIQUE constraints, `get-port` for finding free TCP ports
2. **Env injection** — `with-env` command that injects allocated ports into any command
3. **Worktree management** — creates/destroys git worktrees for isolation

Docker, process management, and everything else is the user's responsibility.

### Why Not Docker Orchestration?

**v0.6 approach (abandoned):**
- dev-prism generated `docker-compose.session.yml`
- dev-prism ran `docker compose up/down`
- dev-prism discovered ports from running containers
- Result: Tightly coupled to Docker, hard to support app containers in monorepos

**v0.7 approach:**
- dev-prism allocates ports and injects env vars
- Users manage their own Docker setup (or any other tool)
- `docker-compose.yml` uses standard `${VAR:-default}` substitution
- Result: Universal, works with Docker, bare-metal, or any runtime

## Architecture Layers

### 1. Database Layer (`db.ts`)

**Purpose:** SQLite-backed port allocation with UNIQUE constraints

**Schema:**
```sql
sessions (id TEXT PK, branch TEXT, created_at TEXT)
port_allocations (session_id FK, service TEXT, port INTEGER UNIQUE)
reservations (port INTEGER PK, reason TEXT, created_at TEXT)
```

**Key design:**
- `port INTEGER NOT NULL UNIQUE` prevents cross-session conflicts
- `ON DELETE CASCADE` auto-cleans port_allocations when session is deleted
- WAL mode + busy_timeout=5000 for concurrent access
- `get-port` finds free TCP ports, SQLite UNIQUE provides the guarantee

**Port allocation flow:**
```typescript
async function allocatePorts(db, sessionId, services) {
  // 1. Get all existing allocated + reserved ports
  const exclude = [...getAllocatedPorts(db), ...getReservedPorts(db)];

  // 2. Find free ports using get-port (checks TCP availability)
  for (const service of services) {
    const port = await getPort({ exclude });
    exclude.push(port);
    allocations.push({ service, port });
  }

  // 3. INSERT all in a single transaction
  db.transaction(() => {
    for (const alloc of allocations) insert.run(alloc);
  })();

  // 4. Retry once on UNIQUE violation (race condition)
}
```

### 2. Config Layer (`config.ts`)

**Purpose:** Load and validate `prism.config.mjs`

```typescript
interface SessionConfig {
  sessionsDir: string;
  ports: string[];                    // Service names to allocate ports for
  env?: Record<string, string>;      // Global env templates
  apps?: Record<string, Record<string, string>>;  // App-specific env templates
  setup: string[];
}
```

**Template syntax:** `${service_name}` is replaced with the allocated port for that service.

### 3. Env Layer (`env.ts`)

**Purpose:** Render env templates and build session environment

**Key functions:**
- `renderTemplate(template, ports)` — substitutes `${service}` with port values
- `buildSessionEnv(config, workingDir, allocations, appName?)` — renders global env, optionally merges app-specific env
- `formatEnvFile(env)` — formats as `KEY=value\n` for file output
- `getComposeProjectName(workingDir, projectName?)` — MD5 hash for Docker project namespace

### 4. Command Layer

**`with-env` — the centerpiece:**
```
findProjectRoot(cwd) → fails? → exec command as-is (pass-through)
getDbSession(db, cwd) → no session? → exec command as-is (pass-through)
session found → getPortAllocations → buildSessionEnv → merge with process.env → exec
```

Pass-through behavior is critical: makes `with-env` safe in Makefiles/scripts regardless of whether a session exists.

**`create` flow:**
1. Load config, determine working directory (worktree or in-place)
2. Create git worktree (if not in-place)
3. INSERT session record in SQLite
4. Allocate ports via `get-port` + SQLite transaction
5. Run setup commands with session env injected
6. Print summary

**`destroy` flow:**
1. DELETE session from SQLite (cascades to port_allocations)
2. Remove git worktree if applicable

## Data Flow

### Create Session
```
┌────────────────────────────────────┐
│ 1. Load config                      │
│    prism.config.mjs → ports          │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 2. Create worktree (optional)       │
│    git worktree add <path>          │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 3. INSERT session in SQLite         │
│    sessions (id, branch, created_at)│
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 4. Allocate ports                   │
│    get-port → SQLite UNIQUE check   │
│    port_allocations (service, port) │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 5. Run setup commands               │
│    env injected via buildSessionEnv │
└────────────────────────────────────┘
```

### with-env Execution
```
┌────────────────────────────────────┐
│ 1. Find project root               │
│    Walk up looking for config       │
│    Not found → pass-through         │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 2. Look up session by cwd           │
│    No session → pass-through        │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 3. Build session env                │
│    Render templates with ports      │
│    Merge global + app-specific env  │
└────────────────────────────────────┘
                  ↓
┌────────────────────────────────────┐
│ 4. Exec command                     │
│    execa(cmd, args, { env: merged })│
│    Forward exit code                │
└────────────────────────────────────┘
```

## Design Decisions

### SQLite over .env.session Files
- Central registry enables atomic port allocation with UNIQUE constraints
- Instant `list` without directory scanning
- Survives worktree deletion
- CASCADE delete keeps things clean

### `with-env` Pass-Through
- No session = no injection = command runs normally
- Safe to use unconditionally in scripts, Makefiles, CI
- No error output in pass-through mode

### `get-port` + UNIQUE Constraint
- `get-port` checks TCP availability (port not in use by OS)
- SQLite UNIQUE prevents cross-session conflicts
- Two-phase: gather candidates async, then INSERT in sync transaction
- Retry once on race condition

### `better-sqlite3` over Alternatives
- Synchronous API (simpler code, no async overhead)
- Fast and mature
- Needs `--external` in tsup config (native module)

### No Docker Integration
- dev-prism doesn't know about Docker
- COMPOSE_PROJECT_NAME is just another env var
- User's `docker-compose.yml` uses standard `${VAR:-default}` substitution
- Works with any tool: Docker, Podman, bare-metal, etc.

## Testing Strategy

### Unit Tests
- **db.test.ts** — schema idempotency, CRUD, port allocation, UNIQUE constraints, CASCADE
- **config.test.ts** — path resolution
- **env.test.ts** — template rendering, env building, compose project name
- **worktree.test.ts** — branch name generation

### Integration Tests (Manual)
1. `dev-prism create --in-place` → session in SQLite, ports allocated
2. `dev-prism with-env -- env | grep PORT` → ports injected
3. `dev-prism with-env -- docker compose up -d` → Docker uses allocated ports
4. `dev-prism destroy` → session + ports removed
5. `dev-prism with-env -- echo hello` outside session → passes through
