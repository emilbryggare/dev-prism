import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { execa } from 'execa';
import { listActiveSessions } from '../lib/session.js';

export async function stopAllSessions(): Promise<void> {
  const sessions = await listActiveSessions();

  if (sessions.length === 0) {
    console.log(chalk.gray('No active sessions found.'));
    return;
  }

  console.log(chalk.blue(`Stopping ${sessions.length} session(s)...\n`));

  for (const session of sessions) {
    console.log(chalk.gray(`  Stopping session in ${session.workingDir}...`));
    try {
      // Stop containers directly using their container IDs
      // More reliable than docker-compose as it doesn't depend on .env.session
      if (session.containers.length > 0) {
        const containerIds = session.containers.map((c) => c.id);
        await execa('docker', ['stop', ...containerIds], { stdio: 'pipe' });
      }

      // Delete .env.session file
      const envPath = resolve(session.workingDir, '.env.session');
      if (existsSync(envPath)) {
        unlinkSync(envPath);
      }

      console.log(chalk.green(`  Stopped: ${session.workingDir}`));
    } catch {
      console.log(chalk.yellow(`  Warning: Could not stop session in ${session.workingDir}`));
    }
  }

  console.log(chalk.green(`\nStopped ${sessions.length} session(s).`));
}
