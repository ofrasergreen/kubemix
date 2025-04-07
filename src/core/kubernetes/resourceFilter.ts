// Functions that apply filtering logic based on the configuration
// These functions determine which resources to fetch based on namespaces, types,
// and potentially labels/field selectors.

import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { logger } from '../../shared/logger.js';

// Default set of resource types to use if none specified
const DEFAULT_RESOURCE_TYPES = [
  'pods',
  'services',
  'deployments',
  'configmaps',
  'secrets',
  'statefulsets',
  'daemonsets',
  'replicasets',
  'ingresses',
  'persistentvolumeclaims',
];

/**
 * Determines the final list of resource types to fetch based on configuration.
 *
 * @param config - The merged configuration object.
 * @param availableResourceTypes - Optional list of all discoverable resource types.
 * @returns An array of resource type strings to fetch.
 */
export const getResourceTypesToFetch = (
  config: KubeAggregatorConfigMerged,
  availableResourceTypes?: string[], // Optional: Use if discovery is implemented
): string[] => {
  // Ensure filter exists
  const filter = config.filter || {};

  // Step 1: Determine the initial set of types to consider
  // If includeResourceTypes is provided, use it, otherwise use default or discovered types
  let types = filter.includeResourceTypes?.length
    ? [...filter.includeResourceTypes] // Create copy to avoid mutations
    : availableResourceTypes?.length
      ? [...availableResourceTypes]
      : [...DEFAULT_RESOURCE_TYPES];

  logger.debug(`Initial resource types before exclusions: ${types.join(', ')}`);

  // Step 2: Apply exclusions
  if (filter.excludeResourceTypes?.length) {
    const excludeSet = new Set(filter.excludeResourceTypes);
    const excludedTypes = types.filter((type) => excludeSet.has(type));
    types = types.filter((type) => !excludeSet.has(type));

    if (excludedTypes.length) {
      logger.debug(`Excluded resource types: ${excludedTypes.join(', ')}`);
    }
  }

  // Ensure we have at least some types to fetch
  if (types.length === 0) {
    logger.warn('No resource types match the filters. Using a minimal default set.');
    types = ['pods']; // Absolute minimum fallback
  }

  logger.debug(`Final resource types selected for fetching: ${types.join(', ')}`);
  return types;
};

/**
 * Determines the final list of namespaces to query based on configuration.
 *
 * @param config - The merged configuration object.
 * @param availableNamespaces - List of all discovered namespaces.
 * @returns An array of namespace names to query.
 */
export const getNamespacesToQuery = (
  config: KubeAggregatorConfigMerged,
  availableNamespaces: string[], // Required: Need the full list of namespaces
): string[] => {
  // Ensure filter exists
  const filter = config.filter || {};

  // Step 1: Determine initial set of namespaces to consider
  // If namespaces filter is provided, use it as the base set
  // Otherwise use all available namespaces
  let namespacesToConsider = filter.namespaces?.length ? [...filter.namespaces] : [...availableNamespaces];

  logger.debug(`Initial namespaces before exclusions: ${namespacesToConsider.join(', ')}`);

  // Step 2: Apply namespace exclusions
  if (filter.excludeNamespaces?.length) {
    const excludeSet = new Set(filter.excludeNamespaces);
    const excludedNamespaces = namespacesToConsider.filter((ns) => excludeSet.has(ns));
    namespacesToConsider = namespacesToConsider.filter((ns) => !excludeSet.has(ns));

    if (excludedNamespaces.length) {
      logger.debug(`Excluded namespaces: ${excludedNamespaces.join(', ')}`);
    }
  }

  // Step 3: Validate if namespaces in the include list actually exist
  if (filter.namespaces?.length) {
    const availNamespacesSet = new Set(availableNamespaces);
    const nonExistentNamespaces = filter.namespaces.filter((ns) => !availNamespacesSet.has(ns));

    if (nonExistentNamespaces.length) {
      logger.warn(`Some specified namespaces do not exist: ${nonExistentNamespaces.join(', ')}`);
    }
  }

  // Ensure we have at least some namespaces to query
  if (namespacesToConsider.length === 0) {
    logger.warn('No namespaces match the filters. Results will be empty.');
  } else {
    logger.debug(`Final namespaces selected for querying: ${namespacesToConsider.join(', ')}`);
  }

  return namespacesToConsider;
};

/**
 * Determines if a pod is in a failing state based on its YAML/JSON representation.
 * A pod is considered "failing" if:
 * - status.phase is not 'Running' or 'Succeeded'
 * - status.phase is 'Pending' or 'Failed' or 'Unknown'
 * - has high restart count or problematic container statuses
 *
 * @param podManifest - The pod manifest as a parsed object from YAML/JSON
 * @returns True if the pod is in a failing state, false otherwise
 */
export const isPodFailing = (podManifest: any): boolean => {
  try {
    // Check if this is a pod (kind === 'Pod')
    if (!podManifest || podManifest.kind !== 'Pod') {
      return false;
    }

    // Extract status information
    const status = podManifest.status || {};
    const phase = status.phase || '';

    // Consider pods failing if they're not Running or Succeeded
    if (phase !== 'Running' && phase !== 'Succeeded') {
      logger.debug(`Pod '${podManifest.metadata?.name}' in phase '${phase}' identified as failing`);
      return true;
    }

    // Check container statuses for restarts or other issues
    // For Running pods, we might still want to consider them failing if they have issues
    const containerStatuses = status.containerStatuses || [];
    for (const containerStatus of containerStatuses) {
      // Check for high restart count (more than 3 restarts might indicate a problem)
      if (containerStatus.restartCount > 3) {
        logger.debug(
          `Pod '${podManifest.metadata?.name}' has high restart count (${containerStatus.restartCount}), identified as failing`,
        );
        return true;
      }

      // Check if container is waiting for something (might indicate initialization issues)
      if (containerStatus.state?.waiting) {
        const reason = containerStatus.state.waiting.reason || '';
        // Common problematic waiting reasons
        const problematicReasons = ['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError'];

        if (problematicReasons.includes(reason)) {
          logger.debug(
            `Pod '${podManifest.metadata?.name}' container waiting with reason '${reason}', identified as failing`,
          );
          return true;
        }
      }
    }

    // Pod seems healthy
    return false;
  } catch (error) {
    // If we can't analyze the pod for some reason, default to considering it healthy
    logger.warn(`Error analyzing pod for failing state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};
