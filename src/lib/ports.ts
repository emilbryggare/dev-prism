import type { PortMapping } from './docker-inspect.js';

// Extract ports from Docker container inspection
// Returns a map of service_INTERNAL_PORT -> external port
export function extractPorts(portMappings: PortMapping[]): Record<string, number> {
  const ports: Record<string, number> = {};

  for (const mapping of portMappings) {
    // Use uppercase service name + _PORT as env var name
    const envVarName = `${mapping.service.toUpperCase()}_PORT`;
    ports[envVarName] = mapping.externalPort;
  }

  return ports;
}

// Format ports for display
export function formatPortsTable(ports: Record<string, number>): string {
  const lines: string[] = [];
  for (const [name, port] of Object.entries(ports)) {
    lines.push(`  ${name}: http://localhost:${port}`);
  }
  return lines.join('\n');
}
