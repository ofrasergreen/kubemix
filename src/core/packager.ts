// src/core/packager.ts

import type { AggregationResult } from '../cli/actions/namespaceAction.js'; // Use the result type defined in the action
// --- Adapted Kubernetes Config/Types ---
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js'; // Renamed

// --- Adapted Kubernetes Core Modules ---
import * as kubectlWrapper from './kubernetes/kubectlWrapper.js';
import * as outputGenerator from './output/outputGenerate.js';
import * as clipboardCopier from './packager/copyToClipboardIfEnabled.js'; // Assuming adapted version
// import * as metricsCalculator from './metrics/calculateMetrics.js'; // Keep commented for now
import * as outputWriter from './packager/writeOutputToDisk.js'; // Assuming adapted version

// --- Shared Modules ---
import { logger } from '../shared/logger.js';
import type { ProgressCallback } from '../shared/types.js';

/**
 * Orchestrates the process of aggregating Kubernetes resources.
 * Fetches namespaces and pods, generates output, and writes to disk/clipboard.
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
    getPodNames: kubectlWrapper.getPodNames,
    getPodsYaml: kubectlWrapper.getPodsYaml,
    generateOutput: outputGenerator.generateOutput,
    writeOutputToDisk: outputWriter.writeOutputToDisk,
    copyToClipboardIfEnabled: clipboardCopier.copyToClipboardIfEnabled,
    // calculateMetrics: metricsCalculator.calculateMetrics, // Add later if needed
  },
): Promise<AggregationResult> => {
  logger.info('Starting Kubernetes resource aggregation...');

  // --- 1. Fetch Kubernetes Namespace Data ---
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

    // Fetch the full YAML output for the namespaces section
    namespaceYamlData = await deps.getNamespacesYaml(kubeconfigPath, context);
  } catch (error) {
    logger.error('Failed to fetch Kubernetes namespace data.', error);
    // Propagate the error (it should already be an AppError from kubectlWrapper)
    throw error;
  }

  // --- 2. Fetch Pod Data for Each Namespace ---
  progressCallback('Fetching pods for each namespace...');
  logger.info('Starting to fetch pod data for each namespace...');

  // Initialize data structures to store pod information
  const podsByNamespace: Record<string, string[]> = {};
  const podsYamlData: Record<string, { yaml: string; command: string }> = {};
  let totalPods = 0;

  // Use Promise.all to fetch pod data for all namespaces concurrently for better performance
  await Promise.all(
    namespaceNames.map(async (namespace) => {
      try {
        // Get pod names for the namespace
        const podNames = await deps.getPodNames(namespace, kubeconfigPath, context);
        podsByNamespace[namespace] = podNames;
        totalPods += podNames.length;

        // If there are pods, get the YAML data
        if (podNames.length > 0) {
          logger.debug(`Fetching YAML for ${podNames.length} pods in namespace '${namespace}'...`);
          const yamlData = await deps.getPodsYaml(namespace, kubeconfigPath, context);
          // Only store if we got valid YAML data back
          if (yamlData.yaml) {
            podsYamlData[namespace] = yamlData;
          }
        } else {
          logger.debug(`No pods found in namespace '${namespace}', skipping YAML fetch.`);
        }
      } catch (error) {
        // Log error but continue with other namespaces (error resilience as per AC #9)
        logger.warn(`Error fetching pod data for namespace '${namespace}':`, error);
        // Initialize with empty arrays for namespaces with errors
        podsByNamespace[namespace] = [];
      }
    }),
  );

  logger.info(`Completed pod data fetch. Found ${totalPods} total pods across ${namespaceNames.length} namespaces.`);

  // --- 3. Generate Output String ---
  progressCallback('Generating output file content...');
  const style = config.output?.style || 'markdown';
  logger.debug(`Using output style: ${style}`);
  let outputString: string;
  try {
    outputString = await deps.generateOutput(config, namespaceNames, namespaceYamlData, podsByNamespace, podsYamlData);
  } catch (error) {
    logger.error('Failed to generate output content.', error);
    throw error; // Propagate
  }
  logger.trace('Generated output string length:', outputString.length);

  // --- 4. Write Output to Disk ---
  const filePath = config.output?.filePath || 'kubemix-output.md';
  progressCallback(`Writing output to ${filePath}...`);
  try {
    await deps.writeOutputToDisk(outputString, config);
    logger.info(`Output successfully written to ${filePath}`);
  } catch (error) {
    logger.error(`Failed to write output file to ${filePath}`, error);
    throw error; // Propagate
  }

  // --- 5. Copy to Clipboard (Optional) ---
  // Assuming the adapted function checks config.output.copyToClipboard
  try {
    await deps.copyToClipboardIfEnabled(outputString, progressCallback, config);
  } catch (error) {
    // Log clipboard error but don't fail the whole process
    logger.warn(`Failed to copy output to clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // --- 6. Calculate Metrics ---
  progressCallback('Calculating metrics...');
  const metrics: AggregationResult = {
    namespaceCount: namespaceNames.length,
    podCount: totalPods,
    // Add totalResources, totalYamlSize etc. later
  };
  logger.trace('Calculated metrics:', metrics);

  // --- 7. Return Result ---
  logger.info('Kubernetes resource aggregation finished.');
  return metrics;
};
