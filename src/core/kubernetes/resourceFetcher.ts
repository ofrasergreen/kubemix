// Placeholder for functions that fetch specific Kubernetes resources
// based on type, namespace, name, selectors, etc.
// This will expand significantly as more resource types are supported.

import { KubeAggregatorError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import { executeKubectlCommand } from './kubectlWrapper.js';

export interface FetchedResource {
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    // Other relevant metadata can be added later
  };
  yaml: string; // Full YAML manifest
  command: string; // Command used to fetch
}

/**
 * Fetches YAML for specified resources based on type and optional filters.
 *
 * @param resourceType - The type of resource to fetch (e.g., 'pods', 'deployments.apps').
 * @param namespace - Optional namespace to filter by. If null, fetches across allowed namespaces.
 * @param names - Optional array of specific resource names to fetch.
 * @param labelSelector - Optional label selector string.
 * @param fieldSelector - Optional field selector string.
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise resolving with an array of fetched resource details.
 */
export const fetchResourcesYaml = async (
  resourceType: string,
  namespace?: string | null, // Use null to signify all allowed namespaces explicitly
  names?: string[],
  labelSelector?: string,
  fieldSelector?: string,
  kubeconfigPath?: string,
  context?: string
): Promise<Array<{ yaml: string; command: string }>> => { // Simplified return for now
  const args = ['get', resourceType];

  if (names && names.length > 0) {
    args.push(...names);
  }

  if (namespace) {
    args.push('-n', namespace);
  } else if (namespace === null) {
     // Fetch from all namespaces (kubectl default, but explicit here)
     args.push('--all-namespaces'); // Or handle namespace filtering upstream
  }


  if (labelSelector) {
    args.push('-l', labelSelector);
  }
  if (fieldSelector) {
    args.push('--field-selector', fieldSelector);
  }
  args.push('-o', 'yaml');

  logger.debug(`Fetching YAML for ${resourceType} (ns: ${namespace ?? 'all'}, names: ${names?.join(',') ?? 'all'})...`);

  try {
    // Limitation: This fetches all matching resources as a single multi-document YAML.
    // A more robust implementation might fetch names first, then fetch each resource individually
    // or parse the multi-document YAML stream. For simplicity now, we fetch all at once.
    const { stdout, command } = await executeKubectlCommand(args, kubeconfigPath, context);

    // TODO: If multiple resources are fetched, stdout will be multi-document YAML.
    // For now, we just return the whole blob. Later, this might need splitting.
    if (!stdout.trim()) {
      return []; // No resources found
    }

    return [{ yaml: stdout, command }];
  } catch (error) {
    // Handle cases where the resource type might not exist in a specific namespace gracefully
    if (error instanceof Error && error.message.includes('NotFound')) {
        logger.warn(`Resource type ${resourceType} not found in namespace ${namespace ?? 'all'}`);
        return [];
    }
    logger.error(`Failed to fetch ${resourceType}:`, error);
    throw new KubeAggregatorError(`Failed to fetch ${resourceType}: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
};