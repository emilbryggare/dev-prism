import { describe, it, expect } from 'vitest';
import { generateEnvContent, renderAppEnv } from './env.js';

describe('generateEnvContent', () => {
  it('generates env file content with working dir and ports', () => {
    const content = generateEnvContent('/path/to/session', { POSTGRES_PORT: 47110 }, 'myproject');

    expect(content).toContain('SESSION_DIR=/path/to/session');
    expect(content).toContain('COMPOSE_PROJECT_NAME=myproject');
    expect(content).toContain('POSTGRES_PORT=47110');
  });

  it('includes all provided ports', () => {
    const ports = {
      POSTGRES_PORT: 47110,
      REDIS_PORT: 47111,
      APP_PORT: 47100,
    };
    const content = generateEnvContent('/path/to/session', ports, 'project');

    expect(content).toContain('POSTGRES_PORT=47110');
    expect(content).toContain('REDIS_PORT=47111');
    expect(content).toContain('APP_PORT=47100');
  });

  it('ends with newline', () => {
    const content = generateEnvContent('/path/to/session', {}, 'project');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('handles empty ports', () => {
    const content = generateEnvContent('/path/to/session', {}, 'project');
    expect(content).toContain('SESSION_DIR=/path/to/session');
    expect(content).toContain('COMPOSE_PROJECT_NAME=project');
  });
});

describe('renderAppEnv', () => {
  it('substitutes port variables in template', () => {
    const template = {
      DATABASE_URL: 'postgres://localhost:${POSTGRES_PORT}/db',
    };
    const ports = { POSTGRES_PORT: 47110 };

    const result = renderAppEnv(template, ports);
    expect(result).toEqual({
      DATABASE_URL: 'postgres://localhost:47110/db',
    });
  });

  it('substitutes multiple variables in one value', () => {
    const template = {
      CACHE_URL: 'redis://${REDIS_HOST}:${REDIS_PORT}',
    };
    const ports = { REDIS_HOST: 47120, REDIS_PORT: 47111 };

    const result = renderAppEnv(template, ports);
    expect(result).toEqual({
      CACHE_URL: 'redis://47120:47111',
    });
  });

  it('handles templates with no variables', () => {
    const template = { API_KEY: 'secret123' };
    const ports = { POSTGRES_PORT: 47110 };

    const result = renderAppEnv(template, ports);
    expect(result).toEqual({ API_KEY: 'secret123' });
  });

  it('leaves unmatched variables as-is', () => {
    const template = { URL: 'http://localhost:${UNKNOWN_PORT}' };
    const ports = { POSTGRES_PORT: 47110 };

    const result = renderAppEnv(template, ports);
    expect(result).toEqual({ URL: 'http://localhost:${UNKNOWN_PORT}' });
  });

  it('handles empty template', () => {
    const result = renderAppEnv({}, { PORT: 3000 });
    expect(result).toEqual({});
  });
});
