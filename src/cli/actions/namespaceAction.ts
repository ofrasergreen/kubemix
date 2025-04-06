import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CliOptions } from '../types.js';
import { logger } from '../../shared/logger.js';
import { loadMergedConfig } from '../../config/configLoad.js';
import { aggregateResources } from '../../core/packager.js';
import { printCompletion, printSummary } from '../cliPrint.js';

// Result structure from the core aggregation logic
export interface AggregationResult {
  namespaceCount: number;
  // Add other relevant metrics later (pod count, total size, etc.)
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
      filePath: 'kubemix-output.md'
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
  );
  logger.log('');
  printCompletion();
};