import process from 'node:process';
import { Command, Option } from 'commander';
import pc from 'picocolors';

import { handleError } from '../shared/errorHandle.js'; // Assuming this exists
import { kubeAggregatorLogLevels, logger } from '../shared/logger.js';
// Import the namespace action
import { runNamespacesAction } from './actions/namespaceAction.js';
import type { CliOptions } from './types.js';
// import { getVersion } from '../core/kubernetes/kubeVersion.js'; // Placeholder for future version logic

export const run = async () => {
  try {
    // Define the main command structure
    program
      .name('kubemix')
      .description('KubeMix - Aggregate Kubernetes resources into a single file')
      // Define options based on CliOptions
      .option('-o, --output <file>', 'Specify the output file name (default: kubemix-output.md)')
      .option('--style <type>', 'Specify the output style (default: markdown)')
      .option('--kubeconfig <path>', 'Path to the kubeconfig file')
      .option('--context <name>', 'Kubernetes context to use')
      .option('--format <format>', 'Specify kubectl output format (default: text, options: text, yaml, json)')
      .option('-n, --namespace <ns1,ns2,...>', 'Specify namespaces to include (comma-separated)')
      .option('--exclude-namespace <ns1,ns2,...>', 'Specify namespaces to exclude (comma-separated)')
      .option('--include-type <type1,type2,...>', 'Specify resource types to include (comma-separated)')
      .option('--exclude-type <type1,type2,...>', 'Specify resource types to exclude (comma-separated)')
      .option('--no-redact-secrets', 'Disable redaction of Secret data (NOT RECOMMENDED)')
      .option('--no-diagnostics', 'Disable diagnostics for failing pods')
      .option('--pod-log-lines <number>', 'Number of log lines to fetch for failing pods (default: 50)')
      .option('-c, --config <path>', 'Path to a custom config file')
      .addOption(new Option('--verbose', 'Enable verbose logging').conflicts('quiet'))
      .addOption(new Option('--quiet', 'Disable informational output').conflicts('verbose'))
      // Define the action to take when the command is run
      .action(commanderActionEndpoint);

    // Add custom error handling/suggestions later if needed (like Repomix)
    // program.configureOutput({ ... });

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    // Handle any top-level errors
    handleError(error);
    process.exit(1); // Ensure exit on error
  }
};

// Entry point called by Commander's action handler
const commanderActionEndpoint = async (options: CliOptions = {}) => {
  // Pass control to the main CLI logic function
  await runCli(options);
};

// Main CLI logic function
export const runCli = async (options: CliOptions) => {
  // Set log level based on verbose/quiet flags
  if (options.quiet) {
    logger.setLogLevel(kubeAggregatorLogLevels.SILENT);
  } else if (options.verbose) {
    logger.setLogLevel(kubeAggregatorLogLevels.DEBUG);
  } else {
    logger.setLogLevel(kubeAggregatorLogLevels.INFO); // Default log level
  }

  logger.trace('cwd:', process.cwd());
  logger.trace('options:', options);

  // Basic version display (add later)
  // if (options.version) {
  //   await runVersionAction();
  //   return;
  // }

  // Configuration initialization (add later)
  // if (options.init) {
  //   await runInitAction(process.cwd(), options.global ?? false);
  //   return;
  // }

  // Fetch version (add later)
  // const version = await getVersion(); // Assuming a way to get tool version
  const version = '0.1.0'; // Placeholder
  logger.log(pc.dim(`\n📦 KubeAggregator v${version}\n`));

  // Execute the primary action (fetching namespaces for now)
  try {
    // Using runNamespacesAction specifically for this feature
    await runNamespacesAction(options);
  } catch (error) {
    handleError(error);
    process.exit(1); // Ensure exit on error during action
  }
};

// Export the program instance if needed for testing or extensions
export const program = new Command();
