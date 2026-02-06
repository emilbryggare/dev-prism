import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Minimal config interface - all Docker config lives in docker-compose.session.yml
export interface SessionConfig {
  projectName?: string; // Project name for Docker namespace (defaults to directory name)
  portBase: number;
  sessionsDir: string;
  ports: Record<string, number>; // Flat map of VAR_NAME -> offset
  appEnv?: Record<string, Record<string, string>>; // Optional app-specific env vars
  apps?: string[]; // Available app profiles for docker mode
  envFiles?: string[]; // .env files to copy to session and update DATABASE_URL
  setup: string[];
  services?: Array<{ name: string; internalPort: number }>; // Services to expose with ports
}

const DEFAULT_CONFIG: SessionConfig = {
  portBase: 47000,
  sessionsDir: '../sessions',
  ports: {
    POSTGRES_PORT: 10,
  },
  setup: ['pnpm install'],
};

export async function loadConfig(projectRoot: string): Promise<SessionConfig> {
  // Try .mjs first, then .js
  let configPath = resolve(projectRoot, 'session.config.mjs');
  if (!existsSync(configPath)) {
    configPath = resolve(projectRoot, 'session.config.js');
  }

  if (!existsSync(configPath)) {
    console.warn('No session.config.mjs found, using defaults');
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

export function getSessionsDir(config: SessionConfig, projectRoot: string): string {
  return resolve(projectRoot, config.sessionsDir);
}

export function getSessionDir(config: SessionConfig, projectRoot: string, sessionId: string): string {
  return resolve(getSessionsDir(config, projectRoot), `session-${sessionId}`);
}
