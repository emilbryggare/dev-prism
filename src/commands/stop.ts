import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { execa } from 'execa';
import { getSession } from '../lib/session.js';

export async function stopSession(workingDir: string): Promise<void> {
  const session = await getSession(workingDir);

  if (!session) {
    console.error(chalk.red(`Error: No session found in directory: ${workingDir}`));
    process.exit(1);
  }

  console.log(chalk.blue(`Stopping session in ${workingDir}...`));

  // Stop containers directly using their container IDs
  // This is more reliable than using docker-compose because it doesn't depend on
  // .env.session or other files that may have been deleted
  if (session.containers.length > 0) {
    const containerIds = session.containers.map((c) => c.id);
    await execa('docker', ['stop', ...containerIds], { stdio: 'inherit' });
  }

  // Delete .env.session file
  const envPath = resolve(workingDir, '.env.session');
  if (existsSync(envPath)) {
    unlinkSync(envPath);
    console.log(chalk.gray(`Deleted: ${envPath}`));
  }

  console.log(chalk.green('Session stopped.'));
}
