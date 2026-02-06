#!/usr/bin/env node

import { Command } from 'commander';
import { createSession } from '../dist/commands/create.js';
import { destroySession } from '../dist/commands/destroy.js';
import { listSessions } from '../dist/commands/list.js';
import { installClaude } from '../dist/commands/claude.js';
import { showInfo } from '../dist/commands/info.js';
import { startSession } from '../dist/commands/start.js';
import { stopSession } from '../dist/commands/stop.js';
import { stopAllSessions } from '../dist/commands/stop-all.js';
import { pruneSessions } from '../dist/commands/prune.js';
import { streamLogs } from '../dist/commands/logs.js';

const program = new Command();

program
  .name('dev-prism')
  .description('CLI tool for managing isolated parallel development sessions')
  .version('0.6.0');

program
  .command('create')
  .description('Create a new isolated development session')
  .option('-m, --mode <mode>', 'App mode: docker (default) or native', 'docker')
  .option('-b, --branch <branch>', 'Git branch name (default: session/TIMESTAMP)')
  .option('-W, --without <apps>', 'Exclude apps (comma-separated: app,web,widget)', (val) => val.split(','))
  .option('--no-detach', 'Stream container logs after starting (default: detach)')
  .option('--in-place', 'Run in current directory instead of creating a worktree')
  .action(async (options) => {
    const projectRoot = process.cwd();
    await createSession(projectRoot, undefined, {
      mode: options.mode,
      branch: options.branch,
      detach: options.detach,
      without: options.without,
      inPlace: options.inPlace,
    });
  });

program
  .command('destroy [directory]')
  .description('Destroy a development session (defaults to current directory)')
  .option('-a, --all', 'Destroy all sessions')
  .action(async (directory, options) => {
    const workingDir = directory || process.cwd();
    await destroySession(workingDir, { all: options.all });
  });

program
  .command('list')
  .description('List all active development sessions')
  .action(async () => {
    await listSessions();
  });

program
  .command('info')
  .description('Show session info for current directory (useful for --in-place sessions)')
  .action(async () => {
    await showInfo(process.cwd());
  });

program
  .command('start [directory]')
  .description('Start Docker services for a session (defaults to current directory)')
  .option('-m, --mode <mode>', 'App mode: docker or native', 'docker')
  .option('-W, --without <apps>', 'Exclude apps (comma-separated: app,web,widget)', (val) => val.split(','))
  .action(async (directory, options) => {
    const workingDir = directory || process.cwd();
    await startSession(workingDir, {
      mode: options.mode,
      without: options.without,
    });
  });

program
  .command('stop [directory]')
  .description('Stop Docker services for a session (defaults to current directory)')
  .action(async (directory) => {
    const workingDir = directory || process.cwd();
    await stopSession(workingDir);
  });

program
  .command('logs [directory]')
  .description('Stream logs from a session\'s Docker services (defaults to current directory)')
  .option('-m, --mode <mode>', 'App mode: docker or native', 'docker')
  .option('-W, --without <apps>', 'Exclude apps (comma-separated: app,web,widget)', (val) => val.split(','))
  .option('-n, --tail <lines>', 'Number of lines to show from the end', '50')
  .action(async (directory, options) => {
    const workingDir = directory || process.cwd();
    await streamLogs(workingDir, {
      mode: options.mode,
      without: options.without,
      tail: options.tail,
    });
  });

program
  .command('stop-all')
  .description('Stop all running sessions (preserves data)')
  .action(async () => {
    await stopAllSessions();
  });

program
  .command('prune')
  .description('Remove all stopped sessions (destroys data)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    await pruneSessions({ yes: options.yes });
  });

program
  .command('claude')
  .description('Install Claude Code integration (skill + CLAUDE.md)')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (options) => {
    await installClaude(process.cwd(), { force: options.force });
  });

program
  .command('help')
  .description('Show detailed help and examples')
  .action(async () => {
    const chalk = (await import('chalk')).default;

    console.log(`
${chalk.bold('dev-prism')} - Manage isolated parallel development sessions

${chalk.bold('USAGE')}
  dev-prism <command> [options]

${chalk.bold('COMMANDS')}
  ${chalk.cyan('create')}           Create a new session
  ${chalk.cyan('destroy')} [dir]    Destroy a session (defaults to current directory)
  ${chalk.cyan('list')}             List all active sessions
  ${chalk.cyan('info')}             Show session info for current directory
  ${chalk.cyan('start')} [dir]      Start Docker services (defaults to current directory)
  ${chalk.cyan('stop')} [dir]       Stop Docker services (defaults to current directory)
  ${chalk.cyan('stop-all')}         Stop all running sessions
  ${chalk.cyan('logs')} [dir]       Stream logs (defaults to current directory)
  ${chalk.cyan('prune')}            Remove all stopped session directories

${chalk.bold('EXAMPLES')}
  ${chalk.gray('# Create a new session with worktree')}
  $ dev-prism create

  ${chalk.gray('# Create session with specific branch name')}
  $ dev-prism create --branch feature/my-feature

  ${chalk.gray('# Create session in native mode (apps run on host)')}
  $ dev-prism create --mode native

  ${chalk.gray('# Create session without web app')}
  $ dev-prism create --without web

  ${chalk.gray('# Create session in current directory (no worktree)')}
  $ dev-prism create --in-place

  ${chalk.gray('# Check session status in current directory')}
  $ dev-prism info

  ${chalk.gray('# Stop session in current directory')}
  $ dev-prism stop

  ${chalk.gray('# Stop all running sessions')}
  $ dev-prism stop-all

  ${chalk.gray('# Clean up old stopped session directories')}
  $ dev-prism prune

  ${chalk.gray('# Destroy session in current directory')}
  $ dev-prism destroy

  ${chalk.gray('# Destroy all sessions')}
  $ dev-prism destroy --all

${chalk.bold('SESSION MODES')}
  ${chalk.cyan('docker')} (default)  All apps run in containers
  ${chalk.cyan('native')}            Only infrastructure in Docker, apps on host

${chalk.bold('MORE INFO')}
  Run ${chalk.cyan('dev-prism <command> --help')} for command-specific options
`);
  });

program.parse();
