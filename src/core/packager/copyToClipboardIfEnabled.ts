// src/core/packager/copyToClipboardIfEnabled.ts
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { logger } from '../../shared/logger.js';
import type { ProgressCallback } from '../../shared/types.js';

/**
 * Copies the output string to the clipboard if enabled in config.
 * For now, this is a placeholder implementation as clipboard functionality
 * is not required in the initial version.
 *
 * @param outputString - The content to potentially copy to clipboard.
 * @param progressCallback - Callback for reporting progress.
 * @param config - The merged configuration.
 * @returns A promise that resolves when the operation is complete.
 */
export const copyToClipboardIfEnabled = async (
  outputString: string,
  progressCallback: ProgressCallback,
  config: KubeAggregatorConfigMerged,
): Promise<void> => {
  // In the future, check config.output.copyToClipboard or similar flag
  // For now, do nothing as clipboard copying is not in initial requirements
  logger.trace('Clipboard copy functionality not implemented yet');
  
  // Return immediately - no clipboard functionality for now
  return Promise.resolve();
};