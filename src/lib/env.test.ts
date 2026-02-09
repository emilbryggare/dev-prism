import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  buildSessionEnv,
  formatEnvFile,
  getComposeProjectName,
} from './env.js';
import type { SessionConfig } from './config.js';
import type { PortAllocation } from './db.js';

describe('renderTemplate', () => {
  it('substitutes service name variables', () => {
    const template = {
      DATABASE_URL: 'postgresql://localhost:${postgres}/db',
    };
    const ports = { postgres: 54321 };

    const result = renderTemplate(template, ports);
    expect(result).toEqual({
      DATABASE_URL: 'postgresql://localhost:54321/db',
    });
  });

  it('substitutes multiple variables in one value', () => {
    const template = {
      URL: 'http://${host}:${app}/api',
    };
    const ports = { host: 8080, app: 3000 };

    const result = renderTemplate(template, ports);
    expect(result).toEqual({
      URL: 'http://8080:3000/api',
    });
  });

  it('handles templates with no variables', () => {
    const template = { API_KEY: 'secret123' };
    const ports = { postgres: 54321 };

    const result = renderTemplate(template, ports);
    expect(result).toEqual({ API_KEY: 'secret123' });
  });

  it('leaves unmatched variables as-is', () => {
    const template = { URL: 'http://localhost:${unknown}' };
    const ports = { postgres: 54321 };

    const result = renderTemplate(template, ports);
    expect(result).toEqual({ URL: 'http://localhost:${unknown}' });
  });

  it('handles empty template', () => {
    const result = renderTemplate({}, { postgres: 54321 });
    expect(result).toEqual({});
  });
});

describe('buildSessionEnv', () => {
  const config: SessionConfig = {
    projectName: 'myproject',
    sessionsDir: '../sessions',
    ports: ['postgres', 'app'],
    env: {
      POSTGRES_PORT: '${postgres}',
      DATABASE_URL: 'postgresql://localhost:${postgres}/db',
    },
    apps: {
      'my-app': {
        PORT: '${app}',
        DB: 'postgresql://localhost:${postgres}/db',
      },
    },
    setup: [],
  };

  const allocations: PortAllocation[] = [
    { session_id: '/session', service: 'postgres', port: 54321 },
    { session_id: '/session', service: 'app', port: 30001 },
  ];

  it('renders global env with port substitution', () => {
    const env = buildSessionEnv(config, '/path/to/session', allocations);
    expect(env.POSTGRES_PORT).toBe('54321');
    expect(env.DATABASE_URL).toBe('postgresql://localhost:54321/db');
  });

  it('includes COMPOSE_PROJECT_NAME', () => {
    const env = buildSessionEnv(config, '/path/to/session', allocations);
    expect(env.COMPOSE_PROJECT_NAME).toMatch(/^myproject-/);
  });

  it('merges app-specific env when appName provided', () => {
    const env = buildSessionEnv(
      config,
      '/path/to/session',
      allocations,
      'my-app'
    );
    expect(env.PORT).toBe('30001');
    expect(env.DB).toBe('postgresql://localhost:54321/db');
    expect(env.POSTGRES_PORT).toBe('54321');
  });

  it('ignores unknown app names', () => {
    const env = buildSessionEnv(
      config,
      '/path/to/session',
      allocations,
      'unknown-app'
    );
    expect(env.PORT).toBeUndefined();
  });
});

describe('formatEnvFile', () => {
  it('formats env as KEY=value lines', () => {
    const env = { FOO: 'bar', BAZ: '123' };
    const result = formatEnvFile(env);
    expect(result).toBe('FOO=bar\nBAZ=123\n');
  });

  it('ends with newline', () => {
    const result = formatEnvFile({ A: '1' });
    expect(result.endsWith('\n')).toBe(true);
  });
});

describe('getComposeProjectName', () => {
  it('includes project name and directory hash', () => {
    const name = getComposeProjectName('/some/dir', 'myproject');
    expect(name).toMatch(/^myproject-[a-f0-9]{8}$/);
  });

  it('uses directory basename when no project name', () => {
    const name = getComposeProjectName('/some/dir');
    expect(name).toMatch(/^dir-[a-f0-9]{8}$/);
  });

  it('produces different hashes for different directories', () => {
    const name1 = getComposeProjectName('/dir/one', 'project');
    const name2 = getComposeProjectName('/dir/two', 'project');
    expect(name1).not.toBe(name2);
  });
});
