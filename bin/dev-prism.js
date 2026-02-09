#!/usr/bin/env node

import { Command } from 'commander';
import { createSession } from '../dist/commands/create.js';
import { destroySession } from '../dist/commands/destroy.js';
import { listSessions } from '../dist/commands/list.js';
import { installClaude } from '../dist/commands/claude.js';
import { showInfo } from '../dist/commands/info.js';
import { withEnv } from '../dist/commands/with-env.js';
import { showEnv } from '../dist/commands/env.js';
import { pruneSessions } from '../dist/commands/prune.js';

const program = new Command();

program
  .name('dev-prism')
  .description('Port allocator, env injector, and worktree manager for parallel development')
  .version('0.7.0')
  .enablePositionalOptions();

program
  .command('create')
  .description('Create a new session (allocate ports + optional worktree)')
  .option('-b, --branch <branch>', 'Git branch name (default: session/TIMESTAMP)')
  .option('--in-place', 'Run in current directory instead of creating a worktree')
  .action(async (options) => {
    const projectRoot = process.cwd();
    await createSession(projectRoot, {
      branch: options.branch,
      inPlace: options.inPlace,
    });
  });

program
  .command('destroy')
  .description('Destroy session for current directory (deallocate ports + remove worktree)')
  .option('-a, --all', 'Destroy all sessions')
  .action(async (options) => {
    await destroySession(process.cwd(), { all: options.all });
  });

program
  .command('list')
  .description('List all sessions')
  .action(async () => {
    await listSessions();
  });

program
  .command('info')
  .description('Show session ports and env vars for current directory')
  .action(async () => {
    await showInfo(process.cwd());
  });

const withEnvCmd = program
  .command('with-env [app]')
  .description('Inject session env vars and exec a command')
  .passThroughOptions()
  .allowUnknownOption()
  .action(async (app, options, cmd) => {
    // Everything after -- becomes the command to run
    const args = cmd.args;

    // If app is provided but looks like the start of the command (no matching app),
    // it might be the command itself. The separator is --.
    // Commander puts everything after -- into cmd.args.

    let appName;
    let command;

    if (app && args.length > 0) {
      // app is provided and there are args after --
      appName = app;
      command = args;
    } else if (app && args.length === 0) {
      // No --, treat app as the first part of the command
      // This handles: dev-prism with-env echo hello
      command = [app];
    } else {
      command = args;
    }

    await withEnv(command, appName);
  });

program
  .command('env')
  .description('Print or write session env vars')
  .option('-w, --write <path>', 'Write env to file instead of stdout')
  .option('-a, --app <name>', 'Include app-specific env vars')
  .action(async (options) => {
    await showEnv({ write: options.write, app: options.app });
  });

program
  .command('prune')
  .description('Remove orphaned sessions from the database')
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
${chalk.bold('dev-prism')} - Port allocator, env injector, and worktree manager

${chalk.bold('USAGE')}
  dev-prism <command> [options]

${chalk.bold('COMMANDS')}
  ${chalk.cyan('create')}                        Create a new session (ports + worktree)
  ${chalk.cyan('destroy')}                       Destroy session for current directory
  ${chalk.cyan('list')}                          List all sessions
  ${chalk.cyan('info')}                          Show session info for current directory
  ${chalk.cyan('with-env')} [app] -- <command>   Inject env vars + exec command
  ${chalk.cyan('env')}                           Print/write session env vars
  ${chalk.cyan('prune')}                         Remove orphaned sessions
  ${chalk.cyan('claude')}                        Install Claude Code integration

${chalk.bold('EXAMPLES')}
  ${chalk.gray('# Create a new session with worktree')}
  $ dev-prism create

  ${chalk.gray('# Create session with specific branch name')}
  $ dev-prism create --branch feature/my-feature

  ${chalk.gray('# Create session in current directory (no worktree)')}
  $ dev-prism create --in-place

  ${chalk.gray('# Start Docker services with injected ports')}
  $ dev-prism with-env -- docker compose up -d

  ${chalk.gray('# Run app with app-specific env vars')}
  $ dev-prism with-env my-app -- pnpm dev

  ${chalk.gray('# Show session env vars')}
  $ dev-prism env

  ${chalk.gray('# Write env file for IDE')}
  $ dev-prism env --write .env

  ${chalk.gray('# Destroy session in current directory')}
  $ dev-prism destroy

  ${chalk.gray('# Destroy all sessions')}
  $ dev-prism destroy --all

  ${chalk.gray('# Clean up orphaned sessions')}
  $ dev-prism prune

${chalk.bold('MORE INFO')}
  Run ${chalk.cyan('dev-prism <command> --help')} for command-specific options
`);
  });

program.parse();
