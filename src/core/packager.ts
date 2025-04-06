// src/core/packager.ts

// --- Adapted Kubernetes Config/Types ---
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js'; // Renamed
import type { AggregationResult } from '../cli/actions/namespaceAction.js'; // Use the result type defined in the action

// --- Adapted Kubernetes Core Modules ---
import * as kubectlWrapper from './kubernetes/kubectlWrapper.js';
import * as outputGenerator from './output/outputGenerate.js';
// import * as metricsCalculator from './metrics/calculateMetrics.js'; // Keep commented for now
import * as outputWriter from './packager/writeOutputToDisk.js'; // Assuming adapted version
import * as clipboardCopier from './packager/copyToClipboardIfEnabled.js'; // Assuming adapted version

// --- Shared Modules ---
import { logger } from '../shared/logger.js';
import type { ProgressCallback } from '../shared/types.js';

/**
 * Orchestrates the process of aggregating Kubernetes resources.
 * Fetches namespaces, generates output, and writes to disk/clipboard.
 *
 * @param config - The merged configuration object.
 * @param progressCallback - Optional callback for reporting progress.
 * @param deps - Dependency injection for testing.
 * @returns A promise resolving with aggregation metrics.
 */
export const aggregateResources = async (
  config: KubeAggregatorConfigMerged,
  progressCallback: ProgressCallback = () => {},
  // Inject dependencies for easier testing
  deps = {
    getNamespaceNames: kubectlWrapper.getNamespaceNames,
    getNamespacesYaml: kubectlWrapper.getNamespacesYaml,
    generateOutput: outputGenerator.generateOutput,
    writeOutputToDisk: outputWriter.writeOutputToDisk,
    copyToClipboardIfEnabled: clipboardCopier.copyToClipboardIfEnabled,
    // calculateMetrics: metricsCalculator.calculateMetrics, // Add later if needed
  },
): Promise<AggregationResult> => {
  logger.info('Starting Kubernetes resource aggregation...');

  // --- 1. Fetch Kubernetes Data ---
  progressCallback('Fetching Kubernetes namespaces...');
  logger.debug('Extracting Kubernetes config for kubectl calls...');
  const kubeconfigPath = config.kubernetes?.kubeconfigPath;
  const context = config.kubernetes?.context;

  let namespaceNames: string[];
  let namespaceYamlData: { yaml: string; command: string };

  try {
    // Fetch names first for the tree structure
    namespaceNames = await deps.getNamespaceNames(kubeconfigPath, context);
    logger.info(`Found ${namespaceNames.length} namespaces.`);

    // Fetch the full YAML output for the main content
    namespaceYamlData = await deps.getNamespacesYaml(kubeconfigPath, context);
  } catch (error) {
    logger.error('Failed to fetch Kubernetes data.', error);
    // Propagate the error (it should already be an AppError from kubectlWrapper)
    throw error;
  }

  // --- 2. Generate Output String ---
  progressCallback('Generating output file content...');
  const style = config.output?.style || 'markdown';
  logger.debug(`Using output style: ${style}`);
  let outputString: string;
  try {
    outputString = await deps.generateOutput(
        config,
        namespaceNames,
        namespaceYamlData,
        // Pass only necessary dependencies to generateOutput if needed
    );
  } catch (error) {
      logger.error('Failed to generate output content.', error);
      throw error; // Propagate
  }
  logger.trace('Generated output string length:', outputString.length);


  // --- 3. Write Output to Disk ---
  const filePath = config.output?.filePath || 'kubemix-output.md';
  progressCallback(`Writing output to ${filePath}...`);
  try {
      await deps.writeOutputToDisk(outputString, config);
      logger.info(`Output successfully written to ${filePath}`);
  } catch (error) {
      logger.error(`Failed to write output file to ${filePath}`, error);
      throw error; // Propagate
  }


  // --- 4. Copy to Clipboard (Optional) ---
  // Assuming the adapted function checks config.output.copyToClipboard
  try {
      await deps.copyToClipboardIfEnabled(outputString, progressCallback, config);
  } catch(error) {
      // Log clipboard error but don't fail the whole process
      logger.warn(`Failed to copy output to clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // --- 5. Calculate Metrics (Basic for now) ---
  progressCallback('Calculating metrics...');
  // For this initial feature, metrics are simple
  const metrics: AggregationResult = {
      namespaceCount: namespaceNames.length,
      // Add totalResources, totalYamlSize etc. later
  };
  logger.trace('Calculated metrics:', metrics);

  // --- 6. Return Result ---
  logger.info('Kubernetes resource aggregation finished.');
  return metrics;
};