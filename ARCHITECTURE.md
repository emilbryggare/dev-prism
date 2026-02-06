# dev-prism Architecture

## Overview

dev-prism is a **stateless orchestration layer** for Docker Compose that enables parallel development sessions with complete isolation. It treats Docker as the single source of truth and derives all state from container inspection.

## Design Philosophy

### Core Principle: Stateless by Design

**No database. No persistent state. Docker is reality.**

Every dev-prism command:
1. Queries Docker to understand current state
2. Performs requested action
3. Updates ephemeral files (`.env.session`) that can be regenerated at any time

This eliminates entire classes of problems:
- State divergence between database and Docker
- Stale session metadata
- Complex reconciliation logic
- Database corruption or loss

### Why Not a Database?

**v1 Problems (with SQLite):**
```
User runs: docker rm -f postgres-001
Database says: Session 001 is running
Reality: Container is gone
Result: Inconsistent state, manual intervention needed
```

**v2 Solution (stateless):**
```
User runs: docker rm -f postgres-001
dev-prism list: Queries Docker, sees no containers
Result: Session simply doesn't appear - no inconsistency possible
```

## Architecture Layers

### 1. Docker Inspection Layer (`docker-inspect.ts`)

**Purpose:** Query and parse Docker's current state

**Key Functions:**
- `listManagedContainers()` - Find all dev-prism containers
- `inspectContainer(id)` - Get detailed port mappings
- `getPortMappings(workingDir)` - Extract ports for a session
- `groupContainersByWorkingDir()` - Organize containers into sessions

**How it works:**
```typescript
// Query all managed containers
docker ps --filter "label=dev-prism.managed=true" --format json

// Parse labels to find sessions
{
  "dev-prism.working_dir": "/path/to/session",
  "dev-prism.service": "postgres",
  "dev-prism.internal_port": "5432"
}

// Inspect for port mappings
docker inspect <container-id>
// Extract: NetworkSettings.Ports["5432/tcp"][0].HostPort = "54321"
```

### 2. Session Model (`session.ts`)

**Purpose:** Build session objects from Docker state

**Session Identity:**
```typescript
interface Session {
  sessionId: string;        // Full working directory path
  workingDir: string;       // Same as sessionId
  running: boolean;         // Any container running?
  containers: ContainerInfo[];
  ports: PortMapping[];
  createdAt: string | null;
}
```

**Why directory path as ID?**
- Natural, filesystem-based identity
- One session per directory maximum
- No need to track ID allocation
- Works for both worktree and in-place modes

**Building sessions:**
```typescript
async function buildSession(workingDir: string, containers: ContainerInfo[]): Promise<Session> {
  // Inspect each container for port details
  // Group ports by service
  // Return complete session object
}
```

### 3. Port Management (`ports.ts`, `compose.ts`)

**Strategy: Random allocation + discovery**

#### Why Random Ports?

**Alternatives considered:**
1. **Predictable allocation** (v1 approach)
   - Formula: `basePort + sessionId * 100 + offset`
   - Problem: Requires centralized tracking
   - Problem: Users don't actually need predictability

2. **Port pooling**
   - Pre-allocate ranges
   - Problem: Complex to implement
   - Problem: Still needs coordination

3. **Random assignment** (chosen)
   - Docker picks from ephemeral range (32768-60999)
   - 28,000 available ports
   - Natural conflict avoidance
   - Zero configuration

#### Implementation

**Phase 1: Compose file generation**
```yaml
services:
  postgres:
    ports:
      - "0:5432"  # Host port 0 = random assignment
```

**Phase 2: Container startup**
```bash
docker compose up -d
# Docker assigns: 54321:5432, 32768:3000, etc.
```

**Phase 3: Port discovery**
```typescript
async function getPortMappings(workingDir: string): Promise<PortMapping[]> {
  const containers = await listManagedContainers();
  const sessionContainers = containers.filter(
    c => c.labels['dev-prism.working_dir'] === workingDir
  );

  // Inspect each container
  for (const container of sessionContainers) {
    const detailed = await inspectContainer(container.id);
    // Extract: port.publicPort from NetworkSettings.Ports
  }
}
```

**Phase 4: Environment file update**
```typescript
// .env.session
POSTGRES_PORT=54321  # Discovered
APP_PORT=32768       # Discovered
```

### 4. Container Labeling

**Every container gets:**
```yaml
labels:
  dev-prism.managed: "true"                    # For filtering
  dev-prism.working_dir: "/full/path/to/dir"  # Session grouping
  dev-prism.session_id: "/full/path/to/dir"   # Identity
  dev-prism.service: "postgres"               # Service name
  dev-prism.internal_port: "5432"             # Container port
  dev-prism.created_at: "2026-02-06T12:30:45Z"
```

**Why labels?**
- Native Docker feature
- Survives container restarts
- Queryable with `docker ps --filter`
- No external state needed

### 5. Compose File Generation (`compose.ts`)

**Problem:** Users shouldn't write `docker-compose.session.yml`

**Solution:** Generate it automatically

```typescript
function generateComposeFile(
  workingDir: string,
  projectName: string,
  services: Array<{ name: string; internalPort: number }>
): string {
  // For each service:
  // 1. Extend from docker-compose.yml
  // 2. Add random port binding (0:internalPort)
  // 3. Add dev-prism labels
  // 4. Return YAML string
}
```

**Why extend instead of copy?**
- Single source of truth for service definitions
- Users maintain only `docker-compose.yml`
- dev-prism adds session-specific configuration

### 6. Auto-Healing

**Principle:** Commands regenerate missing artifacts from Docker state

**Scenarios:**

1. **Missing `.env.session`**
   ```bash
   $ rm .env.session
   $ dev-prism info
   # Queries Docker, extracts ports, regenerates file
   ```

2. **Manual container removal**
   ```bash
   $ docker rm -f postgres-001
   $ dev-prism list
   # Session simply doesn't appear - no error
   ```

3. **Orphaned files**
   ```bash
   $ dev-prism stop
   # Deletes .env.session
   # If containers gone, no error - just cleanup
   ```

## Data Flow

### Create Session

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Check for existing session                               │
│    docker ps --filter "label=dev-prism.working_dir=<path>"  │
│    If found: Exit with error                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Create worktree (or use current dir)                     │
│    git worktree add <path> -b <branch>                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Generate docker-compose.session.yml                      │
│    - Extends docker-compose.yml services                    │
│    - Adds ports: "0:5432" (random host port)                │
│    - Adds dev-prism labels                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Write .env.session stub                                  │
│    COMPOSE_PROJECT_NAME=project-<hash>                      │
│    SESSION_DIR=<path>                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Start containers                                         │
│    docker compose up -d                                     │
│    (Docker assigns random ports)                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Discover ports                                           │
│    docker inspect <container-ids>                           │
│    Extract NetworkSettings.Ports                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Update .env.session                                      │
│    POSTGRES_PORT=54321                                      │
│    APP_PORT=32768                                           │
└─────────────────────────────────────────────────────────────┘
```

### List Sessions

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Query all managed containers                             │
│    docker ps --filter "label=dev-prism.managed=true"        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Group by working_dir label                               │
│    Map<workingDir, ContainerInfo[]>                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. For each session:                                        │
│    - Inspect containers for port mappings                   │
│    - Build Session object                                   │
│    - Display summary                                        │
└─────────────────────────────────────────────────────────────┘
```

### Stop Session

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Find session by working dir                              │
│    docker ps --filter "label=dev-prism.working_dir=<path>"  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Stop containers                                          │
│    docker compose -f docker-compose.session.yml stop        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Delete ephemeral files                                   │
│    rm .env.session                                          │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Decision: Directory Path as Session ID

**Alternatives:**
1. Numeric IDs (001, 002, 003) - requires allocation tracking
2. UUIDs - not human-friendly
3. Branch names - might conflict
4. Directory paths - chosen

**Rationale:**
- Natural filesystem identity
- One session per directory makes sense
- No allocation needed
- Works for both worktree and in-place modes
- Prevents accidental duplicate sessions

### Decision: Random Port Assignment

**Why not predictable?**

**User interview findings:**
- Programmtic discovery: ✅ Critical (read from file)
- Port conflict avoidance: ✅ Critical
- Stable port numbers: ❌ Nice-to-have, not critical

**Analysis:**
- Users need to discover ports anyway (for tooling)
- Port stability was assumed requirement, not actual
- Random ports eliminate allocation complexity
- Docker's ephemeral range is sufficient

**Trade-offs:**
- Pro: Zero configuration
- Pro: Natural conflict avoidance
- Pro: Simpler implementation
- Con: Can't memorize ports
- Con: URLs change between starts
- Mitigation: `.env.session` provides discovery

### Decision: No Database

**Why SQLite seemed necessary (v1 thinking):**
- Track session allocation
- Store port assignments
- Record session history
- Maintain working directory mapping

**Reality check:**
- Session allocation: Not needed with directory-based IDs
- Port assignments: Docker knows, can be queried
- Session history: Not actually used
- Directory mapping: Container labels provide this

**What we actually need:**
- Find sessions: `docker ps --filter label=...`
- Get ports: `docker inspect`
- Session identity: Container labels
- Session existence: Running containers

All available through Docker API.

### Decision: Labels Over Tags

**Why not container name prefixes?**
```bash
# Name-based
myproject-001-postgres
myproject-001-app

# Label-based
postgres (+ labels)
app (+ labels)
```

**Labels win:**
- More metadata capacity
- Structured querying (`--filter label=key=value`)
- No naming conflicts
- Standard Docker pattern
- Can add metadata without breaking names

### Decision: Auto-Healing Over Validation

**Alternative: Strict validation**
```typescript
if (!existsSync('.env.session')) {
  throw new Error('Session corrupted - .env.session missing');
}
```

**Chosen: Regeneration**
```typescript
if (!existsSync('.env.session')) {
  const ports = await getPortMappings(workingDir);
  writeEnvFile(workingDir, ports, projectName);
}
```

**Why regeneration?**
- Users don't care about "corrupt state"
- They care about "does it work?"
- Missing files are easy to regenerate
- Reduces support burden
- Aligns with stateless philosophy

## Performance Considerations

### Docker Query Overhead

**Concern:** Querying Docker on every command might be slow

**Measurements:**
- `docker ps --filter`: ~50ms (100 containers)
- `docker inspect`: ~30ms per container
- Total for `dev-prism list` with 10 sessions: ~200ms

**Mitigation:**
- Cache within single command execution
- Parallel inspection when possible
- Filter early (managed=true label)

**Trade-off:**
- Slight delay vs. perfect accuracy
- 200ms is acceptable for CLI tool
- Always-correct trumps always-fast

### Port Discovery Delay

**Concern:** Session creation slower due to discovery phase

**Impact:**
- Additional 3s wait for containers to start
- Additional ~100ms for inspection
- Total: ~3.1s overhead

**Justification:**
- One-time cost per session
- Users expect startup delay anyway
- Correctness worth the wait

## Testing Strategy

### Unit Tests

**What to test:**
- Port extraction from mappings
- Label parsing
- Environment file generation
- Branch name generation

**What not to test:**
- Docker integration (flaky, slow)
- File system operations (use mocks)
- Network calls (use fixtures)

### Integration Tests

**Manual verification scenarios:**
1. Create, list, stop, destroy flow
2. Parallel session creation
3. Manual container removal (verify auto-heal)
4. .env.session deletion (verify regeneration)
5. Port conflict handling

## Future Enhancements

### Potential Improvements

**1. Service Discovery from docker-compose.yml**
Currently hardcoded:
```typescript
const services = [
  { name: 'postgres', internalPort: 5432 },
  { name: 'app', internalPort: 3000 },
];
```

Could parse from user's docker-compose.yml:
```typescript
const services = await parseComposeServices('docker-compose.yml');
```

**2. Runtime Port Injection**
```bash
# Instead of reading .env.session
dev-prism exec -- npm test

# Discovers ports, injects, runs command
```

**3. Remote Docker Support**
```bash
export DOCKER_HOST=ssh://remote
dev-prism list  # Works on remote machine
```

Already possible - Docker client handles it.

**4. Session Templates**
```javascript
// session.config.mjs
templates: {
  'api-only': { apps: ['api'] },
  'full-stack': { apps: ['api', 'web', 'worker'] },
}
```

```bash
dev-prism create --template api-only
```

### What NOT to Add

**1. Session history tracking**
- Adds state back in
- Users don't need it
- Logs provide this if needed

**2. Predictable port allocation**
- Adds complexity back
- Solves non-problem
- Random ports work fine

**3. Cross-session orchestration**
- Out of scope
- Use k8s if you need this
- Keep it simple

## Migration Path

### From v0.5.x (Database Version)

**Breaking changes:**
- Session IDs: `001` → `/path/to/session`
- Commands: `dev-prism stop 001` → `dev-prism stop`
- Port allocation: calculated → random
- Storage: SQLite → none

**Migration:**
```bash
# On v0.5.x
dev-prism list          # Note active sessions
dev-prism stop-all      # Stop everything
dev-prism destroy --all # Clean up

# Upgrade
pnpm install -g dev-prism@0.6

# Recreate as needed
cd /path/to/project
dev-prism create
```

**Data migration:**
- Not possible (architecture changed)
- Not needed (sessions are ephemeral)
- Directories can be reused (just recreate containers)

## Conclusion

dev-prism v0.6 embraces **radical simplicity** through statelessness. By treating Docker as the single source of truth, it eliminates entire categories of bugs and complexity.

The architecture prioritizes:
1. **Correctness** over speed (but fast enough)
2. **Simplicity** over features (do one thing well)
3. **Auto-healing** over validation (regenerate, don't complain)
4. **Docker reality** over local state (query, don't cache)

This results in a tool that's **impossible to break** - if Docker is running, dev-prism works.
