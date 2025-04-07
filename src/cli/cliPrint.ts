import path from 'node:path';
import pc from 'picocolors';

// Assuming these exist based on the GitHub issue plan
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js'; // Renamed
import { logger } from '../shared/logger.js'; // Assuming this exists

// Adapted summary printer for Kubernetes resources
export const printSummary = (
  namespaceCount: number,
  outputPath: string,
  config: KubeAggregatorConfigMerged, // Pass config for context if needed
  podCount?: number, // Legacy from FRD-2
  resourceCounts?: Record<string, number>, // Added for FRD-3
  totalResourceCount?: number, // Added for FRD-3
) => {
  logger.log(pc.white('📊 Aggregation Summary:'));
  logger.log(pc.dim('───────────────────────'));
  logger.log(`${pc.white('  Namespaces Found:')} ${pc.white(namespaceCount.toLocaleString())}`);

  // Show resource counts (FRD-3)
  if (resourceCounts && totalResourceCount) {
    logger.log(`${pc.white('Resources Found:')} ${pc.white(totalResourceCount.toLocaleString())} total resources`);

    // Show counts for each type
    const resourceTypes = Object.keys(resourceCounts).sort();
    for (const type of resourceTypes) {
      const count = resourceCounts[type];
      if (count > 0) {
        // Add padding for alignment
        logger.log(`${pc.white(`        ${type}:`)} ${pc.white(count.toLocaleString())}`);
      }
    }
  }
  // Fallback to just showing pod count for backward compatibility (FRD-2)
  else if (typeof podCount === 'number') {
    logger.log(`${pc.white('       Pods Found:')} ${pc.white(podCount.toLocaleString())}`);
  }

  logger.log(`${pc.white('     Output File:')} ${pc.white(outputPath)}`);
  logger.log(`${pc.white('   Output Format:')} ${pc.white(config.kubernetes?.outputFormat || 'text')}`);
  logger.log(`${pc.white('    Output Style:')} ${pc.white(config.output?.style || 'markdown')}`);

  // Add security check summary later if implemented
  // logger.log(`${pc.white('       Security:')} ${pc.white(securityCheckMessage)}`);
};

// Placeholder for security check results (Adapt later)
// export const printSecurityCheck = (
//   // ... params ...
// ) => {
//   if (!config.security.enableSecurityCheck) {
//     return;
//   }
//   logger.log(pc.white('🔎 Security Check:'));
//   logger.log(pc.dim('──────────────────'));
//   // ... logic to print results ...
// };

// Basic completion message
export const printCompletion = () => {
  logger.log(pc.green('🎉 All Done!'));
  logger.log(pc.white('Kubernetes resources aggregated successfully.'));
  // Add link to website later if applicable
  // logger.log('');
  // logger.log(`💡 KubeAggregator website: ${pc.underline('https://your-website.com')}`);
};
