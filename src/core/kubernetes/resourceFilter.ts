// Placeholder for functions that apply filtering logic based on the
// configuration (e.g., include/exclude namespaces/types, label/field selectors).
// This will determine *which* resources to fetch.

import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { logger } from '../../shared/logger.js';

/**
 * Determines the final list of resource types to fetch based on configuration.
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

  let types = filter.includeResourceTypes?.length
    ? filter.includeResourceTypes
    : (availableResourceTypes ?? ['namespaces', 'pods', 'services', 'deployments', 'configmaps', 'secrets']); // Default types if discovery isn't used/fails

  // Apply exclusions
  if (filter.excludeResourceTypes?.length) {
    const excludeSet = new Set(filter.excludeResourceTypes);
    types = types.filter((type) => !excludeSet.has(type));
  }

  logger.debug('Resource types selected for fetching:', types);
  return types;
};

/**
 * Determines the final list of namespaces to query based on configuration.
 * @param config - The merged configuration object.
 * @param availableNamespaces - Optional list of all namespaces found.
 * @returns An array of namespace names to query, or null to query all allowed.
 */
export const getNamespacesToQuery = (
  config: KubeAggregatorConfigMerged,
  availableNamespaces?: string[], // Optional: Use if pre-fetching namespaces
): string[] | null => {
  // Ensure filter exists
  const filter = config.filter || {};

  // Explicit includes take precedence
  if (filter.namespaces?.length) {
    let included = filter.namespaces;
    // Apply exclusions to the included list
    if (filter.excludeNamespaces?.length) {
      const excludeSet = new Set(filter.excludeNamespaces);
      included = included.filter((ns) => !excludeSet.has(ns));
    }
    logger.debug('Namespaces selected for querying (from includes):', included);
    return included;
  }

  // If no specific includes, return null (query all) but respect exclusions upstream if needed
  // The filtering logic in the fetcher/packager should handle excluding the default/configured ones
  // when 'null' is returned here.
  logger.debug('Querying all allowed namespaces (exclusions will be applied).');
  return null; // Signal to query all allowed namespaces
};
