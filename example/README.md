# dev-prism Example

Minimal example showing how to use dev-prism with a simple Node.js app.

## Files

- `prism.config.mjs` - dev-prism configuration (ports + env templates)
- `docker-compose.yml` - Docker services with `${VAR:-default}` port substitution
- `server.js` - Simple Node.js HTTP server
- `Dockerfile` - Container definition

## Usage

```bash
# Create session in-place (uses current directory)
cd example
dev-prism create --in-place

# Check session info
dev-prism info

# Start Docker services with allocated ports
dev-prism with-env -- docker compose up -d

# Run app with session env injected
dev-prism with-env -- node server.js

# Print env vars
dev-prism env

# Destroy session
dev-prism destroy

# Or create with worktree
cd ..
dev-prism create
# Creates worktree in ../sessions/session-TIMESTAMP
```

## What Happens

1. `dev-prism create` allocates ports via `get-port` + SQLite UNIQUE constraints
2. `dev-prism with-env -- <cmd>` reads ports from SQLite, renders env templates, injects into command
3. Docker Compose uses `${VAR:-default}` substitution — works with or without dev-prism
