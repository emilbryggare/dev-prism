import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { SessionConfig } from './config.js';

// Generate .env.session content from discovered ports
export function generateEnvContent(
  workingDir: string,
  ports: Record<string, number>,
  projectName: string
): string {
  const lines = [
    `# Auto-generated session environment`,
    `SESSION_DIR=${workingDir}`,
    `COMPOSE_PROJECT_NAME=${projectName}`,
    '',
    '# Discovered ports from running containers',
  ];

  for (const [name, port] of Object.entries(ports)) {
    lines.push(`${name}=${port}`);
  }

  return lines.join('\n') + '\n';
}

// Write the main .env.session file for docker-compose
export function writeEnvFile(
  workingDir: string,
  ports: Record<string, number>,
  composeProjectName: string
): string {
  const content = generateEnvContent(workingDir, ports, composeProjectName);
  const filePath = resolve(workingDir, '.env.session');
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// Render app-specific env template by substituting port variables
export function renderAppEnv(
  template: Record<string, string>,
  ports: Record<string, number>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(template)) {
    // Replace ${VAR_NAME} with actual port values
    let rendered = value;
    for (const [portName, portValue] of Object.entries(ports)) {
      rendered = rendered.replace(
        new RegExp(`\\$\\{${portName}\\}`, 'g'),
        String(portValue)
      );
    }
    result[key] = rendered;
  }

  return result;
}

// Write app-specific .env.session files (for CLI commands from host)
export function writeAppEnvFiles(
  config: SessionConfig,
  workingDir: string,
  ports: Record<string, number>
): string[] {
  if (!config.appEnv) return [];

  const writtenFiles: string[] = [];

  for (const [appPath, template] of Object.entries(config.appEnv)) {
    const env = renderAppEnv(template, ports);

    const lines = [`# Auto-generated for session in ${workingDir}`, `SESSION_DIR=${workingDir}`];
    for (const [key, value] of Object.entries(env)) {
      lines.push(`${key}=${value}`);
    }

    const content = lines.join('\n') + '\n';
    const envFilePath = resolve(workingDir, appPath, '.env.session');
    mkdirSync(dirname(envFilePath), { recursive: true });
    writeFileSync(envFilePath, content, 'utf-8');
    writtenFiles.push(envFilePath);
  }

  return writtenFiles;
}
