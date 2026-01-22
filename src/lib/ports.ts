import type { SessionConfig } from './config.js';

// Calculate all ports from config offsets
// Returns a flat map of VAR_NAME -> actual port number
export function calculatePorts(
  config: SessionConfig,
  sessionId: string
): Record<string, number> {
  const sessionNum = parseInt(sessionId, 10);
  const basePort = config.portBase + sessionNum * 100;

  const ports: Record<string, number> = {};

  for (const [name, offset] of Object.entries(config.ports)) {
    ports[name] = basePort + offset;
  }

  return ports;
}

// Format ports for display
export function formatPortsTable(ports: Record<string, number>): string {
  const lines: string[] = [];
  for (const [name, port] of Object.entries(ports)) {
    lines.push(`  ${name}: ${port}`);
  }
  return lines.join('\n');
}
