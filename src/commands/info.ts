import chalk from 'chalk';
import { getSession } from '../lib/session.js';

export async function showInfo(cwd: string): Promise<void> {
  const session = await getSession(cwd);

  if (!session) {
    console.log(chalk.yellow('No session running in this directory.'));
    console.log(chalk.gray('Run `dev-prism create --in-place` to create a session here.'));
    process.exit(1);
  }

  console.log(chalk.blue(`\nSession`));
  console.log(chalk.gray(`Directory: ${session.workingDir}`));
  console.log(
    session.running ? chalk.green('Status: running') : chalk.yellow('Status: stopped')
  );

  if (session.containers.length > 0) {
    console.log(chalk.gray(`\nContainers (${session.containers.length}):`));
    for (const container of session.containers) {
      const serviceName = container.labels['dev-prism.service'] || container.name;
      const state = container.state === 'running' ? chalk.green('●') : chalk.gray('○');
      console.log(`  ${state} ${serviceName}`);
    }
  }

  if (session.ports.length > 0) {
    console.log(chalk.gray('\nPorts:'));
    for (const port of session.ports) {
      console.log(chalk.cyan(`  ${port.service}: http://localhost:${port.externalPort}`));
    }
  }

  console.log('');
}
