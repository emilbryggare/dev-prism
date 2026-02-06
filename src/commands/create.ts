import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import chalk from 'chalk';
import { execa } from 'execa';
import { loadConfig, getSessionsDir } from '../lib/config.js';
import { writeEnvFile, writeAppEnvFiles } from '../lib/env.js';
import { createWorktree, generateDefaultBranchName, removeWorktree } from '../lib/worktree.js';
import * as docker from '../lib/docker.js';
import { sessionExists, getPortMappings } from '../lib/docker-inspect.js';
import { extractPorts, formatPortsTable } from '../lib/ports.js';
import { writeComposeFile, generateEnvStub, getComposeProjectName } from '../lib/compose.js';

function updateEnvDatabaseUrl(envPath: string, newDbUrl: string): void {
  if (!existsSync(envPath)) return;

  let content = readFileSync(envPath, 'utf-8');
  // Replace DATABASE_URL line if it exists
  if (content.includes('DATABASE_URL=')) {
    content = content.replace(/^DATABASE_URL=.*/m, `DATABASE_URL=${newDbUrl}`);
  } else {
    // Add it if it doesn't exist
    content += `\nDATABASE_URL=${newDbUrl}\n`;
  }
  writeFileSync(envPath, content);
}

export interface CreateOptions {
  mode?: 'docker' | 'native';
  branch?: string;
  detach?: boolean; // default true, set false to stream logs after starting
  without?: string[]; // apps to exclude in docker mode
  inPlace?: boolean; // run in current directory instead of creating a worktree
}

export async function createSession(
  projectRoot: string,
  _sessionId: string | undefined, // Ignored - now using working directory as session ID
  options: CreateOptions
): Promise<void> {
  // Load config first
  const config = await loadConfig(projectRoot);
  const sessionsDir = getSessionsDir(config, projectRoot);

  const inPlace = options.inPlace ?? false;
  const mode = options.mode || 'docker';

  // Determine working directory
  let workingDir: string;
  let branchName = '';

  if (inPlace) {
    // Use current directory
    workingDir = projectRoot;
    console.log(chalk.blue(`Creating session in current directory (${mode} mode)...`));
  } else {
    // Generate branch name and worktree directory
    branchName = options.branch || generateDefaultBranchName();
    workingDir = resolve(sessionsDir, branchName);

    console.log(chalk.blue(`Creating session (${mode} mode)...`));
    console.log(chalk.gray(`Branch: ${branchName}`));
    console.log(chalk.gray(`Directory: ${workingDir}`));
  }

  // Check if session already exists for this directory
  if (await sessionExists(workingDir)) {
    console.error(chalk.red(`\nError: Session already running in this directory.`));
    console.error(chalk.gray(`Stop it first with: dev-prism stop`));
    process.exit(1);
  }

  let profiles: string[] | undefined;

  try {
    if (!inPlace) {
      // Ensure sessions directory exists
      if (!existsSync(sessionsDir)) {
        mkdirSync(sessionsDir, { recursive: true });
      }

      // Create git worktree
      console.log(chalk.blue('\nCreating git worktree...'));
      await createWorktree(projectRoot, workingDir, branchName);
      console.log(chalk.green(`  Created: ${workingDir}`));
    }

    // Determine services to start
    const projectName = config.projectName ?? basename(projectRoot);

    // Get services from config or use defaults
    const services = config.services ?? [
      { name: 'postgres', internalPort: 5432 },
      { name: 'app', internalPort: 3000 },
    ];

    // Generate docker-compose.session.yml with random port bindings
    console.log(chalk.blue('\nGenerating docker-compose.session.yml...'));
    const composePath = writeComposeFile(workingDir, projectName, services);
    console.log(chalk.green(`  Written: ${composePath}`));

    // Write initial .env.session stub (will be updated after containers start)
    console.log(chalk.blue('\nGenerating .env.session stub...'));
    const envStub = generateEnvStub(workingDir, projectName);
    const envPath = resolve(workingDir, '.env.session');
    writeFileSync(envPath, envStub, 'utf-8');
    console.log(chalk.green(`  Written: ${envPath}`));

    // Copy .env files from source repo if in worktree mode
    if (!inPlace) {
      const envFilesToCopy = config.envFiles ?? [];
      for (const envFile of envFilesToCopy) {
        const srcPath = join(projectRoot, envFile);
        const destPath = join(workingDir, envFile);
        if (existsSync(srcPath)) {
          copyFileSync(srcPath, destPath);
          console.log(chalk.green(`  Copied: ${envFile}`));
        }
      }
    }

    // Start docker services
    console.log(chalk.blue('\nStarting Docker services...'));
    if (mode === 'docker') {
      const allApps = config.apps ?? [];
      const excludeApps = options.without ?? [];
      profiles = allApps.filter((app) => !excludeApps.includes(app));
      if (excludeApps.length > 0) {
        console.log(chalk.gray(`  Excluding apps: ${excludeApps.join(', ')}`));
      }
    }
    await docker.up({ cwd: workingDir, profiles, detach: true });

    // Wait for services to be ready
    console.log(chalk.blue('Waiting for services to be ready...'));
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Discover ports from running containers
    console.log(chalk.blue('\nDiscovering ports from containers...'));
    const portMappings = await getPortMappings(workingDir);
    const ports = extractPorts(portMappings);

    console.log(chalk.gray('Discovered ports:'));
    console.log(chalk.gray(formatPortsTable(ports)));

    // Update .env.session with discovered ports
    const composeProjectName = getComposeProjectName(workingDir, projectName);
    const finalEnvContent = writeEnvFile(workingDir, ports, composeProjectName);
    console.log(chalk.green(`  Updated: ${finalEnvContent}`));

    // Write app-specific .env.session files
    const appEnvFiles = writeAppEnvFiles(config, workingDir, ports);
    for (const file of appEnvFiles) {
      console.log(chalk.green(`  Written: ${file}`));
    }

    // Update DATABASE_URL in copied .env files if postgres is running
    if (!inPlace && ports.POSTGRES_PORT) {
      const sessionDbUrl = `postgresql://postgres:postgres@localhost:${ports.POSTGRES_PORT}/postgres`;
      const envFilesToCopy = config.envFiles ?? [];
      for (const envFile of envFilesToCopy) {
        const destPath = join(workingDir, envFile);
        if (existsSync(destPath)) {
          updateEnvDatabaseUrl(destPath, sessionDbUrl);
          console.log(chalk.green(`  Updated DATABASE_URL in: ${envFile}`));
        }
      }
    }

    // Run setup commands with session env vars
    if (config.setup.length > 0) {
      console.log(chalk.blue('\nRunning setup commands...'));

      const setupEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        SESSION_DIR: workingDir,
      };

      // Add all port vars
      for (const [name, port] of Object.entries(ports)) {
        setupEnv[name] = String(port);
      }

      // Add DATABASE_URL if postgres is available
      if (ports.POSTGRES_PORT) {
        setupEnv.DATABASE_URL = `postgresql://postgres:postgres@localhost:${ports.POSTGRES_PORT}/postgres`;
      }

      for (const cmd of config.setup) {
        console.log(chalk.gray(`  Running: ${cmd}`));
        const [command, ...args] = cmd.split(' ');
        try {
          await execa(command, args, {
            cwd: workingDir,
            stdio: 'inherit',
            env: setupEnv,
          });
        } catch {
          console.warn(chalk.yellow(`  Warning: Command failed: ${cmd}`));
        }
      }
    }

    // Print success message
    console.log(chalk.green(`\nSession ready!`));
    console.log(chalk.gray(`Directory: ${workingDir}`));

    if (mode === 'docker') {
      console.log(chalk.gray('\nDocker mode - all services in containers.'));
      console.log(chalk.gray('View logs: docker compose -f docker-compose.session.yml logs -f'));
    } else {
      console.log(chalk.gray('\nNative mode - run apps with: pnpm dev'));
    }

    // Print all ports
    console.log(chalk.gray('\nPorts:'));
    for (const [name, port] of Object.entries(ports)) {
      console.log(chalk.cyan(`  ${name}: http://localhost:${port}`));
    }

    // If not detaching, stream logs from all services
    if (options.detach === false) {
      console.log(chalk.blue('\nStreaming logs (Ctrl+C to stop)...'));
      console.log(chalk.gray('─'.repeat(60)));
      try {
        await docker.logs({ cwd: workingDir, profiles });
      } catch (error) {
        // User interrupted with Ctrl+C - this is expected
        const execaError = error as { signal?: string };
        if (execaError.signal === 'SIGINT') {
          console.log(chalk.gray('\n─'.repeat(60)));
          console.log(chalk.yellow('\nLog streaming stopped. Services are still running.'));
          console.log(
            chalk.gray(
              `Resume logs: cd ${workingDir} && docker compose -f docker-compose.session.yml --env-file .env.session logs -f`
            )
          );
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    // Creation failed — clean up artifacts
    console.error(chalk.red('Session creation failed. Cleaning up...'));
    try {
      await docker.down({ cwd: workingDir });
    } catch {
      /* ignore */
    }
    if (!inPlace && branchName) {
      try {
        await removeWorktree(projectRoot, workingDir, branchName);
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}
