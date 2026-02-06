import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { removeWorktree } from '../lib/worktree.js';
import * as docker from '../lib/docker.js';
import { listActiveSessions } from '../lib/session.js';
import { loadConfig, getSessionsDir } from '../lib/config.js';

export interface PruneOptions {
  yes?: boolean;
}

export async function pruneSessions(options: PruneOptions): Promise<void> {
  // Get all running sessions from Docker
  const runningSessions = await listActiveSessions();
  const runningDirs = new Set(runningSessions.map((s) => s.workingDir));

  // Find project root and sessions directory
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const sessionsDir = getSessionsDir(config, projectRoot);

  if (!existsSync(sessionsDir)) {
    console.log(chalk.gray('No sessions directory found.'));
    return;
  }

  // Find all session directories
  const sessionDirs = readdirSync(sessionsDir)
    .map((name) => join(sessionsDir, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    });

  // Find stopped sessions (directories that exist but have no running containers)
  const stoppedSessions = sessionDirs.filter((dir) => !runningDirs.has(dir));

  if (stoppedSessions.length === 0) {
    console.log(chalk.gray('No stopped sessions to prune.'));
    return;
  }

  console.log(chalk.yellow(`\nFound ${stoppedSessions.length} stopped session(s) to prune:`));
  for (const sessionDir of stoppedSessions) {
    const dirName = basename(sessionDir);
    console.log(chalk.gray(`  - ${dirName}`));
  }
  console.log('');

  // Confirm unless --yes flag provided
  if (!options.yes) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.red(
          'Are you sure you want to delete these sessions? This cannot be undone. [y/N] '
        ),
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(chalk.gray('Cancelled.'));
      return;
    }
  }

  console.log(chalk.blue('\nPruning stopped sessions...\n'));

  for (const sessionDir of stoppedSessions) {
    const dirName = basename(sessionDir);
    console.log(chalk.gray(`  Removing ${dirName}...`));
    try {
      // Clean up any docker resources
      const envFile = resolve(sessionDir, '.env.session');
      if (existsSync(envFile)) {
        try {
          await docker.down({ cwd: sessionDir });
        } catch {
          // Ignore errors - containers might already be removed
        }
      }

      // Remove worktree and branch
      await removeWorktree(projectRoot, sessionDir, dirName);
      console.log(chalk.green(`  Removed ${dirName}`));
    } catch {
      console.log(chalk.yellow(`  Warning: Could not fully remove ${dirName}`));
    }
  }

  console.log(chalk.green(`\nPruned ${stoppedSessions.length} session(s).`));
}
