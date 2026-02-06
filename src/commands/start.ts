import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { getSession } from '../lib/session.js';
import * as docker from '../lib/docker.js';
import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';

export interface StartOptions {
  mode?: string;
  without?: string[];
}

export async function startSession(
  workingDir: string,
  options: StartOptions
): Promise<void> {
  // Check if session exists (containers already running)
  const existingSession = await getSession(workingDir);
  if (existingSession && existingSession.running) {
    console.log(chalk.yellow(`Session already running in ${workingDir}`));
    return;
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

  let profiles: string[] | undefined;
  if (options.mode === 'docker') {
    const allApps = config.apps ?? [];
    const excludeApps = options.without ?? [];
    profiles = allApps.filter((app) => !excludeApps.includes(app));
  }

  console.log(chalk.blue(`Starting session in ${workingDir}...`));
  await docker.up({ cwd: workingDir, profiles });
  console.log(chalk.green('Session started.'));
}
