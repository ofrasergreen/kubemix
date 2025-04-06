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
) => {
  logger.log(pc.white('📊 Aggregation Summary:'));
  logger.log(pc.dim('───────────────────────'));
  logger.log(`${pc.white('  Namespaces Found:')} ${pc.white(namespaceCount.toLocaleString())}`);
  // Add more metrics here later (e.g., total resources, pods, services)
  logger.log(`${pc.white('    Output File:')} ${pc.white(outputPath)}`);
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