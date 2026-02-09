import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

const SKILL_CONTENT = `---
allowed-tools: Bash(dev-prism *)
description: Manage isolated development sessions (create, destroy, list, env, with-env)
---

# Dev Session Manager

Manage isolated parallel development sessions with port allocation and env injection.

## Parse Intent from: $ARGUMENTS

- "create" / "new" -> dev-prism create
- "list" / "status" -> dev-prism list
- "info" -> dev-prism info
- "destroy" -> dev-prism destroy
- "env" -> dev-prism env
- "prune" -> dev-prism prune

## Commands

Run from the project root (where prism.config.mjs exists).

After running commands, explain:
1. What happened
2. Relevant ports/env vars
3. Next steps

Warn before destructive operations (destroy, prune).
`;

const CLAUDE_MD_SECTION = `
## Dev Sessions

Port allocator, env injector, and worktree manager for parallel development.

### Commands
\`\`\`bash
dev-prism create [--branch <name>] [--in-place]  # Allocate ports + optional worktree
dev-prism destroy [--all]                         # Deallocate ports + remove worktree
dev-prism list                                    # List sessions from SQLite
dev-prism info                                    # Show session ports/env for cwd
dev-prism with-env -- <command>                   # Inject env + exec command
dev-prism with-env <app> -- <command>             # Inject app-specific env + exec
dev-prism env [--write <path>] [--app <name>]     # Print/write env vars
dev-prism prune [-y]                              # Remove orphaned sessions
\`\`\`

### Port Allocation
Ports are allocated dynamically using \`get-port\` and stored in SQLite.
Each service gets a unique port. Use \`dev-prism info\` to see allocated ports.

### AI Notes
- Use \`dev-prism with-env -- <cmd>\` to run commands with session env injected
- \`with-env\` is a no-op outside a session — safe to use unconditionally
- Use \`dev-prism env\` to see all env vars for the current session
- Docker is not managed by dev-prism — users manage their own compose files
`;

export interface ClaudeOptions {
  force?: boolean;
}

export async function installClaude(projectRoot: string, options: ClaudeOptions): Promise<void> {
  const skillDir = join(projectRoot, '.claude', 'commands');
  const skillPath = join(skillDir, 'session.md');
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  // Create skill
  if (existsSync(skillPath) && !options.force) {
    console.log(chalk.yellow(`Skill already exists: ${skillPath}`));
    console.log(chalk.gray('Use --force to overwrite'));
  } else {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillPath, SKILL_CONTENT);
    console.log(chalk.green(`Created: ${skillPath}`));
  }

  // Update CLAUDE.md
  const marker = '## Dev Sessions';
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(marker)) {
      if (options.force) {
        const beforeSection = content.split(marker)[0];
        writeFileSync(claudeMdPath, beforeSection.trimEnd() + CLAUDE_MD_SECTION);
        console.log(chalk.green(`Updated: ${claudeMdPath}`));
      } else {
        console.log(chalk.yellow('CLAUDE.md already has Dev Sessions section'));
        console.log(chalk.gray('Use --force to overwrite'));
      }
    } else {
      appendFileSync(claudeMdPath, CLAUDE_MD_SECTION);
      console.log(chalk.green(`Updated: ${claudeMdPath}`));
    }
  } else {
    writeFileSync(claudeMdPath, `# Project\n${CLAUDE_MD_SECTION}`);
    console.log(chalk.green(`Created: ${claudeMdPath}`));
  }

  console.log(chalk.blue('\nClaude Code integration installed!'));
  console.log(chalk.gray('Use /session in Claude Code to manage sessions.'));
}
