import path from 'node:path';
import pc from 'picocolors';

// Import types
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js';
import { logger } from '../shared/logger.js';
import type { AggregationResult } from './actions/namespaceAction.js';

/**
 * Formats a number with commas for thousands
 *
 * @param num - The number to format
 * @returns The formatted number string
 */
const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

/**
 * Prints a summary of the aggregation results to the console
 *
 * @param metrics - The aggregation metrics object
 * @param config - The merged configuration
 */
export const printSummary = (metrics: AggregationResult, config: KubeAggregatorConfigMerged) => {
  // Extract values from metrics
  const { namespaceCount, resourceCounts, totalResourceCount, totalCharacters, totalTokens, secretsFound, podCount } =
    metrics;

  // Default output path
  const outputPath = config.output?.filePath || 'kubemix-output.md';

  // Start summary output
  logger.log(pc.white('📊 Aggregation Summary:'));
  logger.log(pc.dim('──────────────────────'));

  // Namespaces
  logger.log(`${pc.white('   Namespaces Found:')} ${pc.white(formatNumber(namespaceCount))}`);

  // Resources
  if (resourceCounts && totalResourceCount) {
    logger.log(`${pc.white('   Total Resources:')} ${pc.white(formatNumber(totalResourceCount))} resources`);

    // Show counts for each type
    const resourceTypes = Object.keys(resourceCounts).sort();
    for (const type of resourceTypes) {
      const count = resourceCounts[type];
      if (count > 0) {
        // Add padding for alignment
        logger.log(`${pc.white(`         ${type}:`)} ${pc.white(formatNumber(count))}`);
      }
    }
  }
  // Fallback to just showing pod count for backward compatibility (FRD-2)
  else if (typeof podCount === 'number') {
    logger.log(`${pc.white('        Pods Found:')} ${pc.white(formatNumber(podCount))}`);
  }

  // Token and character counts (FRD-7)
  if (typeof totalCharacters === 'number') {
    logger.log(`${pc.white(' Total Characters:')} ${pc.white(formatNumber(totalCharacters))} chars`);
  }

  if (typeof totalTokens === 'number' && totalTokens > 0) {
    logger.log(`${pc.white('     Total Tokens:')} ${pc.white(formatNumber(totalTokens))} tokens`);
  } else {
    logger.log(`${pc.white('     Total Tokens:')} ${pc.dim('N/A (token counting unavailable)')}`);
  }

  // Output file
  logger.log(`${pc.white('      Output File:')} ${pc.white(outputPath)}`);

  // Secret redaction status
  let redactionStatus: string;
  if (config.security?.redactSecrets === true) {
    if (secretsFound) {
      redactionStatus = pc.green('Enabled (data fields redacted)');
    } else {
      redactionStatus = pc.green('Enabled (no secrets found)');
    }
  } else {
    redactionStatus = pc.red('Disabled (NOT RECOMMENDED)');
  }
  logger.log(`${pc.white('  Secret Redaction:')} ${redactionStatus}`);

  // Formats and styles
  logger.log(`${pc.white('    Output Format:')} ${pc.white(config.kubernetes?.outputFormat || 'text')}`);
  logger.log(`${pc.white('     Output Style:')} ${pc.white(config.output?.style || 'markdown')}`);

  // Show filtering information if applicable
  if (config.filter) {
    if (config.filter.namespaces?.length) {
      logger.log(`${pc.white('Included Namespaces:')} ${pc.white(config.filter.namespaces.join(', '))}`);
    }
    if (config.filter.excludeNamespaces?.length) {
      logger.log(`${pc.white('Excluded Namespaces:')} ${pc.white(config.filter.excludeNamespaces.join(', '))}`);
    }
    if (config.filter.includeResourceTypes?.length) {
      logger.log(`${pc.white('Included Resource Types:')} ${pc.white(config.filter.includeResourceTypes.join(', '))}`);
    }
    if (config.filter.excludeResourceTypes?.length) {
      logger.log(`${pc.white('Excluded Resource Types:')} ${pc.white(config.filter.excludeResourceTypes.join(', '))}`);
    }
  }
};

// Basic completion message
export const printCompletion = () => {
  logger.log(pc.green('🎉 All Done!'));
  logger.log(pc.white('Kubernetes resources aggregated successfully.'));
};
