// Placeholder for functions related to discovering available API resources
// in the Kubernetes cluster (e.g., using `kubectl api-resources`).
// This will be needed for more dynamic resource fetching later.

import { KubeAggregatorError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import { executeKubectlCommand } from './kubectlWrapper.js';

/**
 * Fetches the list of discoverable API resource types in the cluster.
 * Example: ['pods', 'services', 'deployments.apps', ...]
 *
 * @param kubeconfigPath - Optional path to a specific kubeconfig file.
 * @param context - Optional specific Kubernetes context to use.
 * @returns A promise resolving with an array of resource type names.
 */
export const getApiResources = async (kubeconfigPath?: string, context?: string): Promise<string[]> => {
    logger.debug('Discovering API resources...');
    const args = ['api-resources', '--verbs=list,get', '--namespaced=true', '-o', 'name']; // Focus on namespaced resources we can 'get'
    const argsNonNamespaced = ['api-resources', '--verbs=list,get', '--namespaced=false', '-o', 'name'];

    try {
        const { stdout: namespacedOut } = await executeKubectlCommand(args, kubeconfigPath, context);
        const { stdout: nonNamespacedOut } = await executeKubectlCommand(argsNonNamespaced, kubeconfigPath, context);

        const parseOutput = (stdout: string): string[] =>
            stdout
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

        const namespacedResources = parseOutput(namespacedOut);
        const nonNamespacedResources = parseOutput(nonNamespacedOut);

        const allResources = [...namespacedResources, ...nonNamespacedResources].sort();
        logger.info(`Discovered ${allResources.length} API resource types.`);
        return allResources;
    } catch (error) {
        logger.error('Failed to discover API resources:', error);
        throw new KubeAggregatorError(`Failed to discover API resources: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};