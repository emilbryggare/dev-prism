import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import chalk from 'chalk';
import { removeWorktree } from '../lib/worktree.js';
import * as docker from '../lib/docker.js';
import { listActiveSessions, getSession } from '../lib/session.js';
import { loadConfig, getSessionsDir } from '../lib/config.js';

export interface DestroyOptions {
  all?: boolean;
}

export async function destroySession(
  workingDirOrProjectRoot: string | undefined,
  options: DestroyOptions
): Promise<void> {
  if (options.all) {
    console.log(chalk.blue('Destroying all sessions...'));

    const sessions = await listActiveSessions();
    if (sessions.length === 0) {
      console.log(chalk.gray('No active sessions found.'));
      return;
    }

    for (const session of sessions) {
      await destroySingleSession(session.workingDir);
    }

    console.log(chalk.green(`\nDestroyed ${sessions.length} session(s).`));
    return;
  }

  if (!workingDirOrProjectRoot) {
    console.error(chalk.red('Error: Working directory required. Use --all to destroy all sessions.'));
    process.exit(1);
  }

  // Check if session exists
  const session = await getSession(workingDirOrProjectRoot);
  if (!session) {
    console.error(chalk.red(`Error: No session found in ${workingDirOrProjectRoot}`));
    process.exit(1);
  }

  await destroySingleSession(workingDirOrProjectRoot);

  console.log(chalk.green(`\nSession destroyed.`));
}

async function destroySingleSession(workingDir: string): Promise<void> {
  console.log(chalk.blue(`\nDestroying session in ${workingDir}...`));

  // Stop and remove docker containers
  const envFile = resolve(workingDir, '.env.session');
  if (existsSync(envFile)) {
    console.log(chalk.gray('  Stopping and removing Docker containers...'));
    try {
      await docker.down({ cwd: workingDir });
    } catch {
      // Containers might already be stopped
    }
  }

  // Determine if this is a worktree session by checking if it's in a sessions directory
  // Load config from parent directory to find sessionsDir
  const parentDir = resolve(workingDir, '..');
  let isWorktree = false;
  let projectRoot = '';
  let branchName = '';

  try {
    // Try to find the project root by looking for session.config.mjs/js
    let currentDir = workingDir;
    for (let i = 0; i < 5; i++) {
      currentDir = resolve(currentDir, '..');
      const configPath = resolve(currentDir, 'session.config.mjs');
      const altConfigPath = resolve(currentDir, 'session.config.js');
      if (existsSync(configPath) || existsSync(altConfigPath)) {
        projectRoot = currentDir;
        break;
      }
    }

    if (projectRoot) {
      const config = await loadConfig(projectRoot);
      const sessionsDir = getSessionsDir(config, projectRoot);

      // Check if workingDir is under sessionsDir
      if (workingDir.startsWith(sessionsDir)) {
        isWorktree = true;
        branchName = basename(workingDir);
      }
    }
  } catch {
    // Could not determine if worktree, assume not
  }

  // Remove worktree and branch if this is a worktree session
  if (isWorktree && projectRoot && branchName) {
    console.log(chalk.gray('  Removing git worktree...'));
    try {
      await removeWorktree(projectRoot, workingDir, branchName);
    } catch (error) {
      console.warn(chalk.yellow(`  Warning: Could not remove worktree: ${error}`));
    }
  }

  console.log(chalk.green(`  Session destroyed.`));
}
