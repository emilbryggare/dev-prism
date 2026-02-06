import chalk from 'chalk';
import { listActiveSessions, formatPorts } from '../lib/session.js';

export async function listSessions(): Promise<void> {
  const sessions = await listActiveSessions();

  if (sessions.length === 0) {
    console.log(chalk.gray('No active sessions found.'));
    console.log(chalk.gray('\nTo create a session:'));
    console.log(chalk.cyan('  dev-prism create'));
    return;
  }

  console.log(chalk.blue('Active Sessions:'));
  console.log(chalk.gray('================\n'));

  for (const session of sessions) {
    const statusIcon = session.running ? chalk.green('●') : chalk.red('○');
    const statusText = session.running ? chalk.green('running') : chalk.gray('stopped');
    const containerCount = session.containers.length;

    console.log(`${statusIcon} Session ${statusText} (${containerCount} container${containerCount !== 1 ? 's' : ''})`);
    console.log(chalk.gray(`  Directory: ${session.workingDir}`));

    // Print ports
    if (session.ports.length > 0) {
      console.log(chalk.gray('  Ports:'));
      for (const port of session.ports) {
        console.log(chalk.cyan(`    ${port.service}: http://localhost:${port.externalPort}`));
      }
    }

    console.log('');
  }
}
