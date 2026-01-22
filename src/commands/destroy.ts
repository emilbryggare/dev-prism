import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { loadConfig, getSessionDir } from '../lib/config.js';
import { removeWorktree, getSessionWorktrees } from '../lib/worktree.js';
import * as docker from '../lib/docker.js';

export interface DestroyOptions {
  all?: boolean;
}

export async function destroySession(
  projectRoot: string,
  sessionId: string | undefined,
  options: DestroyOptions
): Promise<void> {
  const config = await loadConfig(projectRoot);
  const sessions = await getSessionWorktrees(projectRoot);

  if (options.all) {
    console.log(chalk.blue('Destroying all sessions...'));

    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found.'));
      return;
    }

    for (const session of sessions) {
      await destroySingleSession(projectRoot, session.sessionId, session.path, session.branch);
    }

    console.log(chalk.green(`\nDestroyed ${sessions.length} session(s).`));
    return;
  }

  if (!sessionId) {
    console.error(chalk.red('Error: Session ID required. Use --all to destroy all sessions.'));
    process.exit(1);
  }

  // Validate session ID
  if (!/^\d{3}$/.test(sessionId)) {
    console.error(chalk.red('Error: Session ID must be exactly 3 digits (001-999)'));
    process.exit(1);
  }

  // Find session to get the actual branch name
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session) {
    console.error(chalk.red(`Error: Session ${sessionId} not found.`));
    process.exit(1);
  }

  await destroySingleSession(projectRoot, sessionId, session.path, session.branch);

  console.log(chalk.green(`\nSession ${sessionId} destroyed.`));
}

async function destroySingleSession(
  projectRoot: string,
  sessionId: string,
  sessionDir: string,
  branchName: string
): Promise<void> {
  console.log(chalk.blue(`\nDestroying session ${sessionId}...`));

  // Stop docker containers if env file exists
  const envFile = resolve(sessionDir, '.env.session');
  if (existsSync(envFile)) {
    console.log(chalk.gray('  Stopping Docker containers...'));
    try {
      await docker.down({ cwd: sessionDir });
    } catch {
      // Containers might already be stopped
    }
  }

  // Remove worktree and branch
  console.log(chalk.gray('  Removing git worktree...'));
  await removeWorktree(projectRoot, sessionDir, branchName);

  console.log(chalk.green(`  Session ${sessionId} destroyed.`));
}
