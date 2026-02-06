# dev-prism Example

Minimal example showing how to use dev-prism with a simple Node.js app.

## Files

- `docker-compose.yml` - Base service definitions (you maintain this)
- `session.config.mjs` - dev-prism configuration
- `server.js` - Simple Node.js HTTP server
- `Dockerfile` - Container definition

## Usage

```bash
# Create session in-place (uses current directory)
cd example
dev-prism create --in-place

# Check session info
dev-prism info

# View logs
dev-prism logs

# Stop session
dev-prism stop

# Or create with worktree
cd ..
dev-prism create
# Creates worktree in ../sessions/session-TIMESTAMP
```

## What Happens

1. dev-prism generates `docker-compose.session.yml` extending your base services
2. Starts containers with random ports (Docker assigns)
3. Discovers actual ports from running containers
4. Writes `.env.session` with discovered ports:
   ```
   APP_PORT=54321  # Random port assigned by Docker
   ```

## Generated Files (gitignored)

- `docker-compose.session.yml` - Auto-generated, don't commit
- `.env.session` - Port mappings, don't commit

## v0.6.0 Changes

In v0.6.0+, you maintain `docker-compose.yml` (base services) and dev-prism generates the session-specific compose file.

**Old (v0.5.x):**
```yaml
# docker-compose.session.yml (you maintained this)
services:
  app:
    ports:
      - "${APP_PORT}:3000"  # Calculated ports
    environment:
      - SESSION_ID=${SESSION_ID}
```

**New (v0.6.0+):**
```yaml
# docker-compose.yml (you maintain this - base services)
services:
  app:
    build: .

# docker-compose.session.yml (dev-prism generates this)
services:
  app:
    extends:
      file: docker-compose.yml
      service: app
    ports:
      - "0:3000"  # Random port
    labels:
      dev-prism.managed: "true"
      dev-prism.working_dir: "/full/path"
```
