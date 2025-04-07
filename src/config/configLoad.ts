import * as fs from 'node:fs/promises';
import path from 'node:path';
// For the initial version, we'll just use regular JSON since JSON5 isn't in the dependencies
// import JSON5 from 'json5'; // Allow comments and trailing commas in config

// Assuming these exist/are adapted
import {
  KubeAggregatorConfigValidationError,
  KubeAggregatorError,
  rethrowValidationErrorIfZodError,
} from '../shared/errorHandle.js';
import { logger } from '../shared/logger.js';
// Use the specific Kubernetes config types/schemas
import {
  type KubeAggregatorConfigCli,
  type KubeAggregatorConfigFile,
  type KubeAggregatorConfigMerged,
  type KubeAggregatorOutputStyle,
  type KubectlOutputFormat,
  defaultConfig,
  defaultFilePathMap,
  kubeAggregatorConfigFileSchema,
  kubeAggregatorConfigMergedSchema,
} from './configSchema.js';
// import { getGlobalDirectory } from './globalDirectory.js'; // Add later if global config is needed

const defaultConfigFileName = 'kube-aggregator.config.json'; // Renamed config file

// Function to load config from global directory (add later if needed)
// const getGlobalConfigPath = () => {
//   return path.join(getGlobalDirectory('kube-aggregator'), defaultConfigFileName); // Pass app name
// };

// Loads config from a file path, validates it against the schema
const loadAndValidateConfig = async (filePath: string): Promise<KubeAggregatorConfigFile> => {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const configData = JSON.parse(fileContent); // Will use regular JSON for now
    // Validate the parsed data against the file schema
    return kubeAggregatorConfigFileSchema.parse(configData);
  } catch (error: unknown) {
    // Rethrow Zod errors with a specific type
    rethrowValidationErrorIfZodError(error, `Invalid configuration in ${filePath}`);
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      throw new KubeAggregatorError(`Invalid JSON syntax in config file ${filePath}: ${error.message}`);
    }
    // Handle file read errors
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw new KubeAggregatorError(`Error reading config file ${filePath}: ${error.message}`);
    }
    // Fallback for other errors
    throw new KubeAggregatorError(
      `Failed to load config from ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

// Loads configuration, trying local path first, then potentially global (add later)
export const loadConfig = async (
  rootDir: string, // Usually process.cwd()
  cliConfigPath: string | null, // Path from --config option
): Promise<KubeAggregatorConfigFile> => {
  let configPathToTry: string;
  let isExplicitPath = false;

  if (cliConfigPath) {
    // If --config is provided, use that path exclusively
    configPathToTry = path.resolve(rootDir, cliConfigPath);
    isExplicitPath = true;
    logger.trace(`Attempting to load explicit config from: ${configPathToTry}`);
  } else {
    // Otherwise, try the default local config file name
    configPathToTry = path.resolve(rootDir, defaultConfigFileName);
    logger.trace(`Attempting to load default local config from: ${configPathToTry}`);
  }

  // Try reading the determined config file path
  try {
    // Check if the file exists and is a file
    const stats = await fs.stat(configPathToTry);
    if (stats.isFile()) {
      return await loadAndValidateConfig(configPathToTry);
    }
    // If it's not a file (e.g., a directory), fall through to error/default handling
  } catch (error: unknown) {
    // If it's specifically a "file not found" error, we can proceed to defaults or global
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      // If it's any other error (permissions, etc.), rethrow
      throw error;
    }
    // File not found, continue...
  }

  // If an explicit path was given but not found, throw an error
  if (isExplicitPath) {
    throw new KubeAggregatorError(`Specified config file not found at ${configPathToTry}`);
  }

  // If default local config was not found, log and return empty config (for now)
  // Add global config check here later if needed
  logger.trace(`No local config found at ${configPathToTry}. Using default settings.`);
  return {}; // Return empty object, defaults will be applied during merge
};

// Merges default, file, and CLI configurations
export const mergeConfigs = (
  cwd: string,
  fileConfig: KubeAggregatorConfigFile,
  cliConfig: KubeAggregatorConfigCli,
): KubeAggregatorConfigMerged => {
  logger.trace('Merging configurations...');
  logger.trace('Default config:', defaultConfig);
  logger.trace('File config:', fileConfig);
  logger.trace('CLI config:', cliConfig);

  // Start with defaults
  let merged: Partial<KubeAggregatorConfigMerged> = { ...defaultConfig };

  // Deep merge function (simple version for this structure)
  const deepMerge = <T extends object>(target: T, source: DeepPartial<T> | undefined): T => {
    if (!source) return target;
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const targetValue = target[key as keyof T];
        const sourceValue = source[key as keyof T];
        if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue)
        ) {
          target[key as keyof T] = deepMerge(targetValue as object, sourceValue as DeepPartial<object>) as T[keyof T];
        } else if (sourceValue !== undefined) {
          // Overwrite or set value if source has it (allows CLI to override file/defaults)
          target[key as keyof T] = sourceValue as T[keyof T];
        }
      }
    }
    return target;
  };

  // Merge file config
  merged = deepMerge(merged, fileConfig);

  // Special handling for filter arrays before applying standard CLI merge

  // Create a copy of the current state of the filter configuration after merging defaults and file config
  const currentFilter = merged.filter ? { ...merged.filter } : {};

  // Handle special cases for filter arrays
  if (cliConfig.filter) {
    // 1. Namespaces: CLI namespaces REPLACE file/default namespaces
    if (cliConfig.filter.namespaces?.length) {
      currentFilter.namespaces = [...cliConfig.filter.namespaces];
      logger.debug(`Using CLI-specified namespaces: ${currentFilter.namespaces.join(', ')}`);
    }

    // 2. Resource types: CLI includeResourceTypes REPLACE file/default includeResourceTypes
    if (cliConfig.filter.includeResourceTypes?.length) {
      currentFilter.includeResourceTypes = [...cliConfig.filter.includeResourceTypes];
      logger.debug(`Using CLI-specified resource types: ${currentFilter.includeResourceTypes.join(', ')}`);
    }

    // 3. Exclude namespaces: CLI excludeNamespaces ADD TO file/default excludeNamespaces
    if (cliConfig.filter.excludeNamespaces?.length) {
      const excludeSet = new Set<string>([
        ...(currentFilter.excludeNamespaces || []),
        ...cliConfig.filter.excludeNamespaces,
      ]);
      currentFilter.excludeNamespaces = Array.from(excludeSet);
      logger.debug(`Combined excluded namespaces: ${currentFilter.excludeNamespaces.join(', ')}`);
    }

    // 4. Exclude resource types: CLI excludeResourceTypes ADD TO file/default excludeResourceTypes
    if (cliConfig.filter.excludeResourceTypes?.length) {
      const excludeSet = new Set<string>([
        ...(currentFilter.excludeResourceTypes || []),
        ...cliConfig.filter.excludeResourceTypes,
      ]);
      currentFilter.excludeResourceTypes = Array.from(excludeSet);
      logger.debug(`Combined excluded resource types: ${currentFilter.excludeResourceTypes.join(', ')}`);
    }

    // Update merged filter with our specially handled arrays
    merged.filter = currentFilter;
  }

  // Now perform standard merge for other CLI options
  // We have to remove filter from cliConfig since we've handled it specially
  const filteredCliConfig = { ...cliConfig };
  filteredCliConfig.filter = undefined;
  merged = deepMerge(merged, filteredCliConfig);

  // Special handling for filePath based on style if not explicitly set
  if (!merged.output?.filePath) {
    const style = merged.output?.style ?? defaultConfig.output.style;
    merged.output = { ...merged.output, filePath: defaultFilePathMap[style] };
    logger.trace(`Output file path defaulted based on style '${style}' to: ${merged.output.filePath}`);
  }

  // Add runtime CWD
  merged.cwd = cwd;

  // Validate the final merged configuration
  try {
    const finalConfig = kubeAggregatorConfigMergedSchema.parse(merged);
    logger.trace('Final merged config:', finalConfig);
    return finalConfig;
  } catch (error) {
    rethrowValidationErrorIfZodError(error, 'Invalid merged configuration');
    // Fallback for non-Zod errors during merge/parse
    throw new KubeAggregatorError(
      `Configuration merging failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

// Helper type for deep merging
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[] ? DeepPartial<U>[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// CLI options type for the buildCliConfig and loadMergedConfig functions
interface CliInputOptions {
  output?: string;
  style?: string;
  kubeconfig?: string;
  context?: string;
  format?: string;
  namespace?: string;
  excludeNamespace?: string;
  includeType?: string;
  excludeType?: string;
  noRedactSecrets?: boolean;
  noDiagnostics?: boolean;
  podLogLines?: number | string;
  config?: string;
  [key: string]: unknown; // Allow other properties we might not handle explicitly
}

/**
 * Builds a partial configuration object from CLI options.
 *
 * @param options - CLI options from command line parser
 * @returns A partial config object with CLI-specific settings
 */
export const buildCliConfig = (options: CliInputOptions): KubeAggregatorConfigCli => {
  const cliConfig: KubeAggregatorConfigCli = {};

  // Map CLI options to config structure
  if (options.output) {
    cliConfig.output = { ...cliConfig.output, filePath: options.output };
  }
  if (options.style) {
    // Basic validation, schema will do more thorough check
    const validStyles = ['markdown', 'xml', 'plain'];
    if (validStyles.includes(options.style.toLowerCase())) {
      cliConfig.output = { ...cliConfig.output, style: options.style.toLowerCase() as KubeAggregatorOutputStyle };
    } else {
      logger.warn(`Invalid style specified: ${options.style}. Defaulting to markdown.`);
    }
  }
  if (options.kubeconfig) {
    cliConfig.kubernetes = { ...cliConfig.kubernetes, kubeconfigPath: options.kubeconfig };
  }
  if (options.context) {
    cliConfig.kubernetes = { ...cliConfig.kubernetes, context: options.context };
  }
  if (options.format) {
    // Basic validation, schema will do more thorough check
    const validFormats = ['text', 'yaml', 'json'];
    if (validFormats.includes(options.format.toLowerCase())) {
      cliConfig.kubernetes = {
        ...cliConfig.kubernetes,
        outputFormat: options.format.toLowerCase() as KubectlOutputFormat,
      };
    } else {
      logger.warn(`Invalid kubectl output format specified: ${options.format}. Defaulting to text.`);
    }
  }

  // Handle namespace and resource type filtering options
  if (options.namespace) {
    const namespaces = options.namespace
      .split(',')
      .map((ns: string) => ns.trim())
      .filter(Boolean);
    if (namespaces.length) {
      cliConfig.filter = { ...cliConfig.filter, namespaces };
      logger.debug(`Including namespaces from CLI: ${namespaces.join(', ')}`);
    }
  }

  if (options.excludeNamespace) {
    const excludeNamespaces = options.excludeNamespace
      .split(',')
      .map((ns: string) => ns.trim())
      .filter(Boolean);
    if (excludeNamespaces.length) {
      cliConfig.filter = { ...cliConfig.filter, excludeNamespaces };
      logger.debug(`Excluding namespaces from CLI: ${excludeNamespaces.join(', ')}`);
    }
  }

  if (options.includeType) {
    const includeResourceTypes = options.includeType
      .split(',')
      .map((type: string) => type.trim())
      .filter(Boolean);
    if (includeResourceTypes.length) {
      cliConfig.filter = { ...cliConfig.filter, includeResourceTypes };
      logger.debug(`Including resource types from CLI: ${includeResourceTypes.join(', ')}`);
    }
  }

  if (options.excludeType) {
    const excludeResourceTypes = options.excludeType
      .split(',')
      .map((type: string) => type.trim())
      .filter(Boolean);
    if (excludeResourceTypes.length) {
      cliConfig.filter = { ...cliConfig.filter, excludeResourceTypes };
      logger.debug(`Excluding resource types from CLI: ${excludeResourceTypes.join(', ')}`);
    }
  }

  // Handle security options
  if (options.noRedactSecrets !== undefined) {
    cliConfig.security = {
      ...cliConfig.security,
      redactSecrets: !options.noRedactSecrets, // Invert the "no" flag
    };
    if (options.noRedactSecrets) {
      logger.warn('⚠️  Secret redaction disabled. Secret data will be included in the output!');
    }
  }

  // Handle diagnostics options
  if (options.noDiagnostics !== undefined || options.podLogLines !== undefined) {
    cliConfig.diagnostics = {
      ...cliConfig.diagnostics,
    };

    if (options.noDiagnostics !== undefined) {
      cliConfig.diagnostics.includeFailingPods = !options.noDiagnostics; // Invert the "no" flag
      if (options.noDiagnostics) {
        logger.debug('Diagnostics for failing pods disabled via CLI option');
      }
    }

    if (options.podLogLines !== undefined) {
      const logLines = Number.parseInt(options.podLogLines.toString(), 10);
      if (!Number.isNaN(logLines) && logLines > 0) {
        cliConfig.diagnostics.podLogTailLines = logLines;
        logger.debug(`Setting pod log tail lines to ${logLines} via CLI option`);
      } else {
        logger.warn(`Invalid pod log lines value: ${options.podLogLines}. Using default.`);
      }
    }
  }

  // Validate the generated CLI config portion against its schema
  try {
    return kubeAggregatorConfigFileSchema.parse(cliConfig);
  } catch (error) {
    rethrowValidationErrorIfZodError(error, 'Invalid CLI arguments');
    // If it's not a Zod error, rethrow the original error
    throw error;
  }
};

/**
 * Convenience function to load and merge config in one go. Used by CLI actions.
 *
 * @param options - CLI options from the command line parser
 * @returns The fully merged and validated configuration
 */
export const loadMergedConfig = async (options: CliInputOptions): Promise<KubeAggregatorConfigMerged> => {
  const cwd = process.cwd();
  const fileConfig = await loadConfig(cwd, options.config ?? null);
  const cliConfig = buildCliConfig(options);
  return mergeConfigs(cwd, fileConfig, cliConfig);
};
