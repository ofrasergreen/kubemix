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

    // Extract stderr from the error object if possible (execFile error often includes it)
    let stderrOutput = '';
    let isPreviousContainerError = false;

    if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') {
      stderrOutput = error.stderr.trim();

      // Special case for previous container logs - this is an expected error
      if (
        commandString.includes('logs') &&
        commandString.includes('--previous') &&
        stderrOutput.includes('previous terminated container') &&
        stderrOutput.includes('not found')
      ) {
        // Only log at debug level since this is expected
        logger.debug(`kubectl command returned expected error: ${stderrOutput || errorMessage}`);
        isPreviousContainerError = true;
        detailedError = `kubectl command failed: ${stderrOutput || errorMessage}`;
      } else {
        detailedError = `kubectl command failed: ${stderrOutput || errorMessage}`;
      }
    } else {
      detailedError = `kubectl command failed: ${errorMessage}`;
    }

    // Log detailed error info at appropriate level
    if (!isPreviousContainerError) {
      logger.error(`kubectl command "${commandString}" failed:`, error);
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
 * Fetches the definition for all accessible namespaces in the specified format.
 *
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @param outputFormat - Optional output format (text, yaml, json). Defaults to text (which is -o wide).
 * @returns A promise resolving with the output content and the command used.
 */
export const getNamespacesOutput = async (
  kubeconfigPath?: string,
  context?: string,
  outputFormat: 'text' | 'yaml' | 'json' = 'text',
): Promise<{ output: string; command: string }> => {
  logger.debug(`Fetching namespaces in ${outputFormat} format...`);

  // Map the outputFormat to kubectl output flag
  const outputFlag = outputFormat === 'text' ? 'wide' : outputFormat;

  // Debug output flag explicitly
  logger.debug(`Using kubectl output flag: -o ${outputFlag} for namespace list format '${outputFormat}'`);

  const args = ['get', 'namespaces', '-o', outputFlag];

  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);
    return { output: stdout, command };
  } catch (error) {
    logger.error('Failed to get namespaces data:', error);
    // Re-throw the error if it's already our type, otherwise wrap it
    if (error instanceof KubeAggregatorError) {
      throw error;
    }
    throw new KubeAggregatorError(
      `Failed to retrieve namespaces data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
    );
  }
};

/**
 * Fetches the names of resources in a given namespace and organizes them by kind.
 *
 * @param namespace - The namespace to fetch resources from.
 * @param types - Array of resource types to fetch. Use ['all'] to fetch all common resource types.
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise that resolves with a record mapping resource kinds to arrays of resource names.
 */
export const getResourcesByName = async (
  namespace: string,
  types: string[],
  kubeconfigPath?: string,
  context?: string,
): Promise<Record<string, string[]>> => {
  // Check if we're using 'all' to get all resources
  const isGetAll = types.includes('all');
  if (isGetAll) {
    logger.debug(`Fetching all resources by name for namespace '${namespace}'...`);
  } else {
    logger.debug(`Fetching resources (${types.join(',')}) by name for namespace '${namespace}'...`);
  }

  // Create empty result structure with empty arrays for each resource type
  const result: Record<string, string[]> = {};
  for (const type of types) {
    // Store with normalized kind name
    result[type] = [];
  }

  // If no types specified, return empty result
  if (!types.length) {
    return result;
  }

  // Build the kubectl command with comma-separated types
  const typeList = types.join(',');
  const args = ['get', typeList, '-n', namespace, '-o', 'name', '--no-headers=true'];

  try {
    const { stdout } = await executeKubectlCommand(args, kubeconfigPath, context);

    // Handle empty case (no resources)
    if (!stdout.trim()) {
      logger.debug(`No resources found in namespace '${namespace}'.`);
      return result;
    }

    // Parse the output (e.g., "pod/nginx-xyz\nservice/svc-1\ndeployment.apps/deploy-1")
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean); // Remove empty lines

    // Process each line and organize by kind
    for (const line of lines) {
      // Split by "/" to get kind and name
      const parts = line.split('/');

      if (parts.length < 2) {
        logger.warn(`Unexpected format in resource name: ${line}`);
        continue;
      }

      // Extract and normalize kind
      let kind = parts[0];

      // Handle special kinds with dots (e.g., deployment.apps -> deployments)
      if (kind.includes('.')) {
        const kindBase = kind.split('.')[0];

        // Map to plural form based on the base name
        const normalizedKinds: Record<string, string> = {
          deployment: 'deployments',
          replicaset: 'replicasets',
          statefulset: 'statefulsets',
          daemonset: 'daemonsets',
          job: 'jobs',
          cronjob: 'cronjobs',
          // Add more special cases as needed
        };

        kind = normalizedKinds[kindBase] || `${kindBase}s`; // Default to adding 's'
      }

      // Ensure the kind exists in result
      if (!result[kind]) {
        result[kind] = [];
      }

      // Add the resource name
      result[kind].push(parts[1]);
    }

    // Log summary of resources found
    const totalResources = Object.values(result).reduce((sum, names) => sum + names.length, 0);
    logger.debug(
      `Found ${totalResources} resources across ${Object.keys(result).filter((k) => result[k].length > 0).length} kinds in namespace '${namespace}'.`,
    );

    return result;
  } catch (error) {
    // Log error but don't fail entirely
    logger.warn(`Failed to get resource names for namespace '${namespace}':`, error);

    // Return initialized empty result for resilience
    return result;
  }
};

/**
 * Fetches the definition for resources in a specific namespace using the specified format.
 *
 * @param namespace - The namespace to fetch resources from.
 * @param types - Array of resource types to fetch. Use ['all'] to fetch all common resource types.
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @param outputFormat - Optional output format (text, yaml, json). Defaults to text (which is -o wide).
 * @returns A promise resolving with the output content and the command used.
 */
export const getResourcesOutput = async (
  namespace: string,
  types: string[],
  kubeconfigPath?: string,
  context?: string,
  outputFormat: 'text' | 'yaml' | 'json' = 'text',
): Promise<{ output: string; command: string }> => {
  // Check if we're using 'all' to get all resources
  const isGetAll = types.includes('all');
  if (isGetAll) {
    logger.debug(`Fetching ${outputFormat} output for all resources in namespace '${namespace}'...`);
  } else {
    logger.debug(`Fetching ${outputFormat} output for types (${types.join(',')}) in namespace '${namespace}'...`);
  }

  // If no types specified, return empty result
  if (!types.length) {
    const outputFlag = outputFormat === 'text' ? 'wide' : outputFormat;
    const commandStr = `kubectl get '' -n ${namespace} -o ${outputFlag}`;
    return { output: '', command: commandStr };
  }

  // Build the kubectl command with comma-separated types
  const typeList = types.join(',');
  const outputFlag = outputFormat === 'text' ? 'wide' : outputFormat;

  // Debug output flag explicitly
  logger.debug(`Using kubectl output flag: -o ${outputFlag} for format '${outputFormat}'`);

  const args = ['get', typeList, '-n', namespace, '-o', outputFlag];

  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);

    // Check if any resources were found
    if (
      !stdout.trim() ||
      (outputFormat === 'yaml' && stdout.includes('items: []')) ||
      (outputFormat === 'json' && stdout.includes('"items": []')) ||
      stdout.includes('No resources found')
    ) {
      logger.debug(`No resources found for types (${types.join(',')}) in namespace '${namespace}'.`);
      return { output: '', command };
    }

    return { output: stdout, command };
  } catch (error) {
    // Log error but don't fail entirely
    logger.warn(`Failed to get resource data for namespace '${namespace}':`, error);

    // Create a command string for return value consistency
    const commandStr = `kubectl get ${types.join(',')} -n ${namespace} -o ${outputFlag}`;
    if (error instanceof KubectlError && error.command) {
      return { output: '', command: error.command };
    }

    // Return empty data but with command string for consistency
    return { output: '', command: commandStr };
  }
};

/**
 * Fetches logs for a pod in a specific namespace
 *
 * @param namespace - The namespace containing the pod
 * @param podName - The name of the pod
 * @param tailLines - Number of log lines to fetch (defaults to 50)
 * @param previous - Whether to fetch logs from the previous container instance
 * @param kubeconfigPath - Optional path to a specific kubeconfig file
 * @param context - Optional specific Kubernetes context to use
 * @returns Promise resolving with the logs and the command used
 */
export const getPodLogs = async (
  namespace: string,
  podName: string,
  tailLines = 50,
  previous = false,
  kubeconfigPath?: string,
  context?: string,
): Promise<{ logs: string; command: string }> => {
  logger.debug(
    `Fetching logs for pod '${podName}' in namespace '${namespace}'${previous ? ' (previous instance)' : ''}...`,
  );

  // Build args for the kubectl logs command
  const args = ['logs', podName, '-n', namespace];

  // Add --previous flag if requested
  if (previous) {
    args.push('--previous');
  }

  // Add --tail flag
  args.push('--tail', tailLines.toString());

  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);
    return { logs: stdout, command };
  } catch (error) {
    // Special handling for previous logs - often fails if no previous container exists
    if (previous) {
      // Extract stderr for error checking
      const stderr =
        error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : '';

      // Check if this is specifically the "previous container not found" error which is expected
      const isContainerNotFoundError = stderr.includes('previous terminated container') && stderr.includes('not found');

      // This is a very common, expected error - only log at trace level
      if (isContainerNotFoundError) {
        logger.trace(`No previous logs found for pod '${podName}' in namespace '${namespace}' (container not found)`);
      } else {
        // Log other errors at warn level (but not error level)
        logger.warn(
          `Error fetching previous logs for pod '${podName}' in namespace '${namespace}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Get the actual command that was executed
      const commandStr =
        error instanceof KubectlError && error.command
          ? error.command
          : `kubectl logs ${podName} -n ${namespace} --previous --tail=${tailLines}`;

      // Return empty logs but include command for context
      return { logs: '(No previous container logs available)', command: commandStr };
    }

    // For current logs, handle error but return useful message
    logger.warn(`Failed to get logs for pod '${podName}' in namespace '${namespace}':`, error);

    // Create command string for return consistency
    const commandStr = `kubectl logs ${podName} -n ${namespace} --tail=${tailLines}`;

    // If it's a KubectlError, use its command
    if (error instanceof KubectlError && error.command) {
      return { logs: `(Error fetching logs: ${error.message || 'Unknown error'})`, command: error.command };
    }

    // Return error message but with command string for context
    return {
      logs: `(Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'})`,
      command: commandStr,
    };
  }
};

/**
 * Describes a pod in a specific namespace, showing detailed information and events
 *
 * @param namespace - The namespace containing the pod
 * @param podName - The name of the pod
 * @param kubeconfigPath - Optional path to a specific kubeconfig file
 * @param context - Optional specific Kubernetes context to use
 * @returns Promise resolving with the describe output and the command used
 */
export const describePod = async (
  namespace: string,
  podName: string,
  kubeconfigPath?: string,
  context?: string,
): Promise<{ description: string; command: string }> => {
  logger.debug(`Describing pod '${podName}' in namespace '${namespace}'...`);

  // Build args for the kubectl describe command
  const args = ['describe', 'pod', podName, '-n', namespace];

  try {
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);
    return { description: stdout, command };
  } catch (error) {
    // Handle error
    logger.warn(`Failed to describe pod '${podName}' in namespace '${namespace}':`, error);

    // Create command string for return consistency
    const commandStr = `kubectl describe pod ${podName} -n ${namespace}`;

    // If it's a KubectlError, use its command
    if (error instanceof KubectlError && error.command) {
      return {
        description: `(Error describing pod: ${error.message || 'Unknown error'})`,
        command: error.command,
      };
    }

    // Return error message but with command string for context
    return {
      description: `(Error describing pod: ${error instanceof Error ? error.message : 'Unknown error'})`,
      command: commandStr,
    };
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
