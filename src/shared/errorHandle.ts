// src/shared/errorHandle.ts
import { z } from 'zod';

// Assuming logger exists
import { logger, kubeAggregatorLogLevels } from './logger.js';
// import { KUBE_AGGREGATOR_ISSUES_URL, KUBE_AGGREGATOR_DISCORD_URL } from './constants.js'; // Add later if needed

// Base custom error class for application-specific errors
export class KubeAggregatorError extends Error {
  // Optional status code for HTTP errors if this becomes an API
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'KubeAggregatorError';
    this.statusCode = statusCode;
    // Ensure the prototype chain is correctly set
    Object.setPrototypeOf(this, KubeAggregatorError.prototype);
  }
}

// Specific error for configuration validation issues
export class KubeAggregatorConfigValidationError extends KubeAggregatorError {
  constructor(message: string) {
    super(message, 400); // Bad Request might be appropriate
    this.name = 'KubeAggregatorConfigValidationError';
    Object.setPrototypeOf(this, KubeAggregatorConfigValidationError.prototype);
  }
}

// Specific error for issues executing kubectl
export class KubectlError extends KubeAggregatorError {
  public readonly stderr?: string;
  public readonly command?: string;

  constructor(message: string, stderr?: string, command?: string) {
    super(message, 500); // Internal Server Error or similar
    this.name = 'KubectlError';
    this.stderr = stderr;
    this.command = command;
    Object.setPrototypeOf(this, KubectlError.prototype);
  }
}


/**
 * Handles errors caught at the top level or during specific actions.
 * Logs the error appropriately and provides user feedback.
 */
export const handleError = (error: unknown): void => {
  logger.log(''); // Add spacing before error message

  if (error instanceof KubeAggregatorError) {
    // Handle known application errors
    logger.error(`✖ ${error.message}`);
    // Include stderr for Kubectl errors if present
    if (error instanceof KubectlError && error.stderr) {
        logger.error(`Command stderr:\n${error.stderr}`);
    }
    // Show stack trace only in debug mode for known errors
    if (logger.getLogLevel() >= kubeAggregatorLogLevels.DEBUG) {
      logger.debug('Stack trace:', error.stack);
    }
  } else if (error instanceof Error) {
    // Handle unexpected JavaScript errors
    logger.error(`✖ Unexpected error: ${error.message}`);
    // Always show stack trace for unexpected errors
    logger.note('Stack trace:', error.stack);
    if (logger.getLogLevel() < kubeAggregatorLogLevels.DEBUG) {
       logger.log('');
       logger.note('For more detailed information, run with the --verbose flag.');
    }
  } else {
    // Handle non-Error exceptions
    logger.error('✖ An unknown error occurred.');
    logger.error('Error details:', error); // Log the unknown error itself
     if (logger.getLogLevel() < kubeAggregatorLogLevels.DEBUG) {
       logger.log('');
       logger.note('For more detailed information, run with the --verbose flag.');
    }
  }

  // Add links to support channels later if needed
  // logger.log('');
  // logger.info('Need help?');
  // logger.info(`• File an issue on GitHub: ${KUBE_AGGREGATOR_ISSUES_URL}`);
  // logger.info(`• Join our Discord community: ${KUBE_AGGREGATOR_DISCORD_URL}`);
};

/**
 * Checks if an error is a Zod validation error and throws a specific
 * KubeAggregatorConfigValidationError if it is.
 *
 * @param error - The error object caught.
 * @param message - A prefix message for the validation error.
 */
export const rethrowValidationErrorIfZodError = (error: unknown, message: string): void => {
  if (error instanceof z.ZodError) {
    // Format Zod errors for better readability
    const zodErrorText = error.errors
      .map((err) => `[${err.path.join('.') || 'config'}]: ${err.message}`) // Add path context
      .join('\n  ');
    throw new KubeAggregatorConfigValidationError(
      `${message}\n\n  ${zodErrorText}\n\nPlease check your configuration and try again.`,
    );
  }
  // If it's not a ZodError, do nothing, allowing the caller to handle it.
};