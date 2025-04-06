import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMergedConfig } from '../../config/configLoad.js';
import { aggregateResources } from '../../core/packager.js';
import { logger } from '../../shared/logger.js';
import { printCompletion, printSummary } from '../cliPrint.js';
import type { CliOptions } from '../types.js';

// Result structure from the core aggregation logic
export interface AggregationResult {
  namespaceCount: number;
  // Legacy field from FRD-2
  podCount?: number;
  // New fields for FRD-3
  resourceCounts?: Record<string, number>; // Map of resource kind to count
  totalResourceCount?: number; // Total resources across all types
  // Add other relevant metrics later (total size, etc.)
}

/**
 * Executes the namespace action, which fetches namespaces from the Kubernetes cluster
 * and generates an output file in the specified format.
 */
export const runNamespacesAction = async (options: CliOptions): Promise<void> => {
  logger.trace('CLI options received:', options);

  // Load configuration with CLI options merged
  const config = await loadMergedConfig(options);
  logger.trace('Merged config:', config);

  // Ensure output.filePath exists
  if (!config.output || !config.output.filePath) {
    config.output = {
      ...config.output,
      filePath: 'kubemix-output.md',
    };
  }

  logger.info('Fetching namespaces from the current Kubernetes cluster...');

  // Call the packager to aggregate resources
  const metrics = await aggregateResources(config);

  // --- Output Summary ---
  logger.log('');
  printSummary(
    metrics.namespaceCount,
    config.output?.filePath || 'kubemix-output.md',
    config,
    metrics.podCount,
    metrics.resourceCounts,
    metrics.totalResourceCount,
  );
  logger.log('');
  printCompletion();
};
