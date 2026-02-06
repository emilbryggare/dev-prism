import chalk from 'chalk';
import { execa } from 'execa';
import { loadConfig } from '../lib/config.js';
import { getSession } from '../lib/session.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface LogsOptions {
  mode?: string;
  without?: string[];
  tail?: string;
}

export async function streamLogs(
  workingDir: string,
  options: LogsOptions
): Promise<void> {
  const session = await getSession(workingDir);
  if (!session) {
    console.error(chalk.red(`Error: No session found in ${workingDir}`));
    process.exit(1);
  }

  // Find project root by looking for config file
  let projectRoot = workingDir;
  for (let i = 0; i < 5; i++) {
    const configPath = resolve(projectRoot, 'session.config.mjs');
    const altConfigPath = resolve(projectRoot, 'session.config.js');
    if (existsSync(configPath) || existsSync(altConfigPath)) {
      break;
    }
    projectRoot = resolve(projectRoot, '..');
  }

  const config = await loadConfig(projectRoot);

  let profileFlags: string[] = [];
  if (options.mode === 'docker') {
    const allApps = config.apps ?? [];
    const excludeApps = options.without ?? [];
    const profiles = allApps.filter((app) => !excludeApps.includes(app));
    profileFlags = profiles.flatMap((p) => ['--profile', p]);
  }

  const args = [
    'compose',
    '-f',
    'docker-compose.session.yml',
    '--env-file',
    '.env.session',
    ...profileFlags,
    'logs',
    '-f',
    '--tail',
    options.tail ?? '50',
  ];

  await execa('docker', args, { cwd: workingDir, stdio: 'inherit' });
}
