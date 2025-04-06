import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Import the actual error class
import { KubeAggregatorError, KubectlError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';

const execFileAsync = promisify(execFile);

// Interface for the result of executing a kubectl command
export interface KubectlResult {
  stdout: string;
  stderr: string;
  command: string; // The exact command string executed
}

/**
 * Executes a kubectl command with the given arguments.
 *
 * @param args - Array of strings representing the command arguments (e.g., ['get', 'pods', '-n', 'default']).
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise that resolves with the KubectlResult.
 * @throws AppError if kubectl is not found or the command fails.
 */
export const executeKubectlCommand = async (
  args: string[],
  kubeconfigPath?: string,
  context?: string,
): Promise<KubectlResult> => {
  const commandArgs: string[] = [];

  // Add context and kubeconfig if provided
  if (kubeconfigPath) {
    commandArgs.push('--kubeconfig', kubeconfigPath);
  }
  if (context) {
    commandArgs.push('--context', context);
  }

  // Add the main command arguments
  commandArgs.push(...args);

  const commandString = `kubectl ${commandArgs.join(' ')}`;
  logger.trace(`Executing: ${commandString}`);

  try {
    const { stdout, stderr } = await execFileAsync('kubectl', commandArgs);

    if (stderr) {
      // Log stderr but don't necessarily throw unless exit code was non-zero (handled below)
      logger.warn(`kubectl stderr for command "${commandString}":\n${stderr}`);
    }

    logger.trace(`kubectl stdout for command "${commandString}":\n${stdout}`);
    return { stdout, stderr, command: commandString };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let detailedError = errorMessage;

    // Check if kubectl is installed/found
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      detailedError = 'kubectl command not found. Please ensure kubectl is installed and in your PATH.';
      logger.error(detailedError);
      throw new KubeAggregatorError(detailedError, 500); // Internal Server Error might be appropriate
    }

    // Log detailed error info for debugging
    logger.error(`kubectl command "${commandString}" failed:`, error);

    // Extract stderr from the error object if possible (execFile error often includes it)
    let stderrOutput = '';
    if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') {
      stderrOutput = error.stderr.trim();
      detailedError = `kubectl command failed: ${stderrOutput || errorMessage}`;
    } else {
      detailedError = `kubectl command failed: ${errorMessage}`;
    }

    // Throw a user-friendly error
    throw new KubectlError(detailedError, stderrOutput, commandString); // Use our specific error type
  }
};

/**
 * Fetches the names of all accessible namespaces.
 *
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise that resolves with an array of namespace names.
 */
export const getNamespaceNames = async (kubeconfigPath?: string, context?: string): Promise<string[]> => {
  logger.debug('Fetching namespace names...');
  const args = ['get', 'namespaces', '-o', 'name'];
  try {
    const { stdout } = await executeKubectlCommand(args, kubeconfigPath, context);

    // Parse the output (e.g., "namespace/default\nnamespace/kube-system")
    const names = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean) // Remove empty lines
      .map((line) => {
        // Extract name after "namespace/"
        const parts = line.split('/');
        return parts.length > 1 ? parts[1] : line; // Handle potential format variations
      });

    logger.debug(`Found ${names.length} namespaces.`);
    return names;
  } catch (error) {
    logger.error('Failed to get namespace names:', error);
    // Re-throw the error if it's already our type, otherwise wrap it
    if (error instanceof KubeAggregatorError) {
      throw error;
    }
    throw new KubeAggregatorError(
      `Failed to retrieve namespace names: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
    );
  }
};

/**
 * Fetches the full YAML definition for all accessible namespaces.
 *
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise resolving with the YAML content and the command used.
 */
export const getNamespacesYaml = async (
  kubeconfigPath?: string,
  context?: string,
): Promise<{ yaml: string; command: string }> => {
  logger.debug('Fetching namespaces YAML...');
  const args = ['get', 'namespaces', '-o', 'yaml'];
  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);
    return { yaml: stdout, command };
  } catch (error) {
    logger.error('Failed to get namespaces YAML:', error);
    // Re-throw the error if it's already our type, otherwise wrap it
    if (error instanceof KubeAggregatorError) {
      throw error;
    }
    throw new KubeAggregatorError(
      `Failed to retrieve namespaces as YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
    );
  }
};

/**
 * Fetches the names of all pods in a given namespace.
 *
 * @param namespace - The namespace to fetch pod names from.
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise that resolves with an array of pod names.
 */
export const getPodNames = async (namespace: string, kubeconfigPath?: string, context?: string): Promise<string[]> => {
  logger.debug(`Fetching pod names for namespace '${namespace}'...`);
  const args = ['get', 'pods', '-n', namespace, '-o', 'name', '--no-headers=true'];

  try {
    const { stdout } = await executeKubectlCommand(args, kubeconfigPath, context);

    // Handle empty case (no pods)
    if (!stdout.trim()) {
      logger.debug(`No pods found in namespace '${namespace}'.`);
      return [];
    }

    // Parse the output (e.g., "pod/nginx-xyz\npod/redis-abc")
    const names = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean) // Remove empty lines
      .map((line) => {
        // Extract name after "pod/"
        const parts = line.split('/');
        return parts.length > 1 ? parts[1] : line;
      });

    logger.debug(`Found ${names.length} pods in namespace '${namespace}'.`);
    return names;
  } catch (error) {
    // Log error but don't fail entirely - this is part of error handling in AC #9
    logger.warn(`Failed to get pod names for namespace '${namespace}':`, error);

    // Return empty array instead of throwing for resilience
    return [];
  }
};

/**
 * Fetches the full YAML definition for all pods in a specific namespace.
 *
 * @param namespace - The namespace to fetch pod YAML from.
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise resolving with the YAML content and the command used.
 */
export const getPodsYaml = async (
  namespace: string,
  kubeconfigPath?: string,
  context?: string,
): Promise<{ yaml: string; command: string }> => {
  logger.debug(`Fetching pods YAML for namespace '${namespace}'...`);
  const args = ['get', 'pods', '-n', namespace, '-o', 'yaml'];

  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);

    // If pods are found, the YAML will be non-empty
    if (!stdout.trim() || stdout.includes('items: []') || stdout.includes('No resources found')) {
      logger.debug(`No pods found in namespace '${namespace}'.`);
      return { yaml: '', command };
    }

    return { yaml: stdout, command };
  } catch (error) {
    // Log error but don't fail entirely - this is part of error handling in AC #9
    logger.warn(`Failed to get pods YAML for namespace '${namespace}':`, error);

    // Create a command string for return value consistency
    const commandStr = `kubectl get pods -n ${namespace} -o yaml`;
    if (error instanceof KubectlError && error.command) {
      return { yaml: '', command: error.command };
    }

    // Return empty YAML but with command string for consistency
    return { yaml: '', command: commandStr };
  }
};

// --- Future Functions (Add as needed) ---

// Example:
// export const getResourceYaml = async (
//   resourceType: string,
//   namespace?: string,
//   resourceName?: string, // Optional: get specific resource
//   labelSelector?: string,
//   fieldSelector?: string,
//   kubeconfigPath?: string,
//   context?: string
// ): Promise<{ yaml: string; command: string }> => {
//   const args = ['get', resourceType];
//   if (resourceName) args.push(resourceName);
//   if (namespace) args.push('-n', namespace);
//   if (labelSelector) args.push('-l', labelSelector);
//   if (fieldSelector) args.push('--field-selector', fieldSelector);
//   args.push('-o', 'yaml');
//
//   logger.debug(`Fetching YAML for ${resourceType}...`);
//   const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);
//   return { yaml: stdout, command };
// };
