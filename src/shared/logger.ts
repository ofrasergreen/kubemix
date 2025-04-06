// src/shared/logger.ts
import util from 'node:util';
import pc from 'picocolors'; // Using picocolors for lightweight coloring

// Define log levels using an enum-like constant object
export const kubeAggregatorLogLevels = {
  SILENT: -1, // No output at all
  ERROR: 0, // Only errors
  WARN: 1, // Errors and warnings
  INFO: 2, // Errors, warnings, and informational messages (default)
  DEBUG: 3, // All messages including debug and trace
} as const;

export type KubeAggregatorLogLevel = (typeof kubeAggregatorLogLevels)[keyof typeof kubeAggregatorLogLevels];

// Logger class to handle different log levels and formatting
class KubeAggregatorLogger {
  private level: KubeAggregatorLogLevel = kubeAggregatorLogLevels.INFO;

  constructor() {
    this.init(); // Set default level on instantiation
  }

  // Initialize or reset the logger to default state
  init() {
    this.setLogLevel(kubeAggregatorLogLevels.INFO);
  }

  // Set the current logging level
  setLogLevel(level: KubeAggregatorLogLevel) {
    this.level = level;
  }

  // Get the current logging level
  getLogLevel(): KubeAggregatorLogLevel {
    return this.level;
  }

  // Log error messages (visible at ERROR level and above)
  error(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.ERROR) {
      console.error(pc.red(this.formatArgs(args)));
    }
  }

  // Log warning messages (visible at WARN level and above)
  warn(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.WARN) {
      console.warn(pc.yellow(this.formatArgs(args))); // Use console.warn for warnings
    }
  }

  // Log success messages (visible at INFO level and above)
  success(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.INFO) {
      console.log(pc.green(this.formatArgs(args)));
    }
  }

  // Log general informational messages (visible at INFO level and above)
  info(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.INFO) {
      console.log(pc.cyan(this.formatArgs(args)));
    }
  }

  // Log standard messages without specific styling (visible at INFO level and above)
  log(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.INFO) {
      console.log(this.formatArgs(args));
    }
  }

  // Log less important informational messages (visible at INFO level and above)
  note(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.INFO) {
      console.log(pc.dim(this.formatArgs(args))); // Use dim for less emphasis
    }
  }

  // Log debug messages (only visible at DEBUG level)
  debug(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.DEBUG) {
      console.log(pc.blue(`[DEBUG] ${this.formatArgs(args)}`)); // Add prefix for clarity
    }
  }

  // Log trace messages for very detailed debugging (only visible at DEBUG level)
  trace(...args: unknown[]) {
    if (this.level >= kubeAggregatorLogLevels.DEBUG) {
      console.log(pc.gray(`[TRACE] ${this.formatArgs(args)}`)); // Use gray and prefix
    }
  }

  // Helper to format arguments, handling objects with util.inspect
  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) =>
        typeof arg === 'object' && arg !== null ? util.inspect(arg, { depth: null, colors: pc.isColorSupported }) : arg,
      )
      .join(' ');
  }
}

// Export a singleton instance of the logger
export const logger = new KubeAggregatorLogger();

// Convenience function to set log level globally (if needed)
export const setLogLevel = (level: KubeAggregatorLogLevel) => {
  logger.setLogLevel(level);
};
