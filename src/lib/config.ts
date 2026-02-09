import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SessionConfig {
  projectName?: string;
  sessionsDir: string;
  ports: string[];
  env?: Record<string, string>;
  apps?: Record<string, Record<string, string>>;
  setup: string[];
}

const DEFAULT_CONFIG: SessionConfig = {
  sessionsDir: '../sessions',
  ports: [],
  setup: ['pnpm install'],
};

export async function loadConfig(projectRoot: string): Promise<SessionConfig> {
  let configPath = resolve(projectRoot, 'prism.config.mjs');
  if (!existsSync(configPath)) {
    configPath = resolve(projectRoot, 'prism.config.js');
  }

  if (!existsSync(configPath)) {
    console.warn('No prism.config.mjs found, using defaults');
    return DEFAULT_CONFIG;
  }

  try {
    const configUrl = pathToFileURL(configPath).href;
    const module = await import(configUrl);
    const userConfig = module.default || module;

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch (error) {
    console.error(`Failed to load config from ${configPath}:`, error);
    return DEFAULT_CONFIG;
  }
}

export function getSessionsDir(
  config: SessionConfig,
  projectRoot: string
): string {
  return resolve(projectRoot, config.sessionsDir);
}
