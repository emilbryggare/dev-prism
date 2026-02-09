import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { SessionConfig } from './config.js';
import type { PortAllocation } from './db.js';

export function renderTemplate(
  template: Record<string, string>,
  ports: Record<string, number>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(template)) {
    let rendered = value;
    for (const [serviceName, portValue] of Object.entries(ports)) {
      rendered = rendered.replace(
        new RegExp(`\\$\\{${serviceName}\\}`, 'g'),
        String(portValue)
      );
    }
    result[key] = rendered;
  }

  return result;
}

export function buildSessionEnv(
  config: SessionConfig,
  workingDir: string,
  allocations: PortAllocation[],
  appName?: string
): Record<string, string> {
  const ports: Record<string, number> = {};
  for (const alloc of allocations) {
    ports[alloc.service] = alloc.port;
  }

  const env: Record<string, string> = {};

  // Add COMPOSE_PROJECT_NAME
  env.COMPOSE_PROJECT_NAME = getComposeProjectName(
    workingDir,
    config.projectName
  );

  // Render global env
  if (config.env) {
    Object.assign(env, renderTemplate(config.env, ports));
  }

  // Merge app-specific env
  if (appName && config.apps?.[appName]) {
    Object.assign(env, renderTemplate(config.apps[appName], ports));
  }

  return env;
}

export function formatEnvFile(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

export function getComposeProjectName(
  workingDir: string,
  projectName?: string
): string {
  const name = projectName ?? basename(workingDir);
  const dirHash = createHash('md5')
    .update(workingDir)
    .digest('hex')
    .substring(0, 8);
  return `${name}-${dirHash}`;
}
