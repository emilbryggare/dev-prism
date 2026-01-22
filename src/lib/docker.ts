import { execa, type ExecaReturnValue } from 'execa';

const COMPOSE_FILE = 'docker-compose.session.yml';
const ENV_FILE = '.env.session';

export interface DockerComposeOptions {
  cwd: string;
  profiles?: string[]; // app profiles for docker mode, undefined for native mode
  detach?: boolean; // default true for up command
}

// Run docker compose command with session env file
async function compose(
  args: string[],
  options: DockerComposeOptions
): Promise<ExecaReturnValue> {
  // Build profile flags: --profile app --profile web etc.
  const profileFlags = options.profiles?.flatMap((p) => ['--profile', p]) ?? [];

  const fullArgs = [
    'compose',
    '-f',
    COMPOSE_FILE,
    '--env-file',
    ENV_FILE,
    ...profileFlags,
    ...args,
  ];

  return execa('docker', fullArgs, {
    cwd: options.cwd,
    stdio: 'inherit',
  });
}

export async function up(options: DockerComposeOptions): Promise<void> {
  const detach = options.detach !== false; // default to detached
  const args = detach ? ['up', '-d'] : ['up'];
  await compose(args, options);
}

// Stream logs from all services (blocking - runs until interrupted)
export async function logs(options: DockerComposeOptions): Promise<void> {
  await compose(['logs', '-f', '--tail=50'], options);
}

export async function down(options: DockerComposeOptions): Promise<void> {
  await compose(['down', '-v'], options);
}

export async function ps(options: DockerComposeOptions): Promise<string> {
  const result = await execa(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '--env-file', ENV_FILE, 'ps', '--format', 'json'],
    { cwd: options.cwd, reject: false }
  );
  return result.stdout;
}

export async function isRunning(options: DockerComposeOptions): Promise<boolean> {
  try {
    const output = await ps(options);
    if (!output.trim()) return false;
    const services = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    return services.some((s: { State: string }) => s.State === 'running');
  } catch {
    return false;
  }
}
