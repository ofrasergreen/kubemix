// src/core/packager.ts

import type { AggregationResult } from '../cli/actions/namespaceAction.js'; // Use the result type defined in the action
// --- Adapted Kubernetes Config/Types ---
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js'; // Renamed

// --- Adapted Kubernetes Core Modules ---
import * as kubectlWrapper from './kubernetes/kubectlWrapper.js';
import * as resourceFilter from './kubernetes/resourceFilter.js';
import * as outputGenerator from './output/outputGenerate.js';
import * as clipboardCopier from './packager/copyToClipboardIfEnabled.js'; // Assuming adapted version
// import * as metricsCalculator from './metrics/calculateMetrics.js'; // Keep commented for now
import * as outputWriter from './packager/writeOutputToDisk.js'; // Assuming adapted version
import { processJsonResourceManifest, processResourceManifest } from './processing/resourceProcessor.js';

// Use 'all' to fetch all common resource types at once
const resourceTypeAll = 'all';

// --- Shared Modules ---
import { logger } from '../shared/logger.js';
import type { ProgressCallback } from '../shared/types.js';

/**
 * Orchestrates the process of aggregating Kubernetes resources.
 * Fetches namespaces and multiple resource types per namespace,
 * generates output, and writes to disk/clipboard.
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
    getNamespacesOutput: kubectlWrapper.getNamespacesOutput,
    getResourcesByName: kubectlWrapper.getResourcesByName,
    getResourcesOutput: kubectlWrapper.getResourcesOutput,
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
  let namespaceData: { output: string; command: string };
  const outputFormat = config.kubernetes?.outputFormat || 'text';

  try {
    // Fetch all namespace names first
    const allNamespaceNames = await deps.getNamespaceNames(kubeconfigPath, context);
    logger.info(`Found ${allNamespaceNames.length} namespaces in total.`);

    // Apply namespace filtering
    namespaceNames = resourceFilter.getNamespacesToQuery(config, allNamespaceNames);
    logger.info(`Selected ${namespaceNames.length} namespaces after filtering.`);

    // Fetch the namespace output in the specified format
    namespaceData = await deps.getNamespacesOutput(kubeconfigPath, context, outputFormat);

    // Process the namespace output to redact any secrets if needed
    if (namespaceData.output) {
      if (config.security?.redactSecrets) {
        // Determine actual output format from command rather than config setting
        let actualFormat = outputFormat;

        // Check the command for the actual format used - more comprehensive checks
        const cmdStr = namespaceData.command.toLowerCase();
        if (cmdStr.includes(' -o yaml') || cmdStr.includes(' --output=yaml') || cmdStr.includes(' --output yaml')) {
          actualFormat = 'yaml';
        } else if (cmdStr.includes(' -o json') || cmdStr.includes(' --output=json') || cmdStr.includes(' --output json')) {
          actualFormat = 'json';
        }
        
        // Debug logging to help diagnose format issues
        logger.debug(`Command used: "${namespaceData.command}"`);
        logger.debug(`Output format from config: ${outputFormat}, detected format: ${actualFormat}`);
        logger.debug(`Output size before processing: ${namespaceData.output.length} chars`);
        
        // Extra verification check for YAML content
        if (namespaceData.output.trim().startsWith('apiVersion:') || namespaceData.output.includes('\napiVersion:')) {
          logger.debug('Output appears to be YAML based on content inspection');
          if (actualFormat !== 'yaml') {
            logger.warn('Content appears to be YAML but format detection says otherwise, forcing YAML processing');
            actualFormat = 'yaml';
          }
        }

        if (actualFormat === 'yaml') {
          logger.debug('Redacting secrets in YAML output for namespaces...');
          namespaceData.output = processResourceManifest(namespaceData.output, config);
        } else if (actualFormat === 'json') {
          logger.debug('Redacting secrets in JSON output for namespaces...');
          namespaceData.output = processJsonResourceManifest(namespaceData.output, config);
        } else {
          logger.debug(`No redaction available for '${actualFormat}' format (text format redaction not supported)`);
        }
      } else {
        logger.debug('Secret redaction disabled in config, skipping redaction for namespaces');
      }
    }
  } catch (error) {
    logger.error('Failed to fetch Kubernetes namespace data.', error);
    // Propagate the error (it should already be an AppError from kubectlWrapper)
    throw error;
  }

  // --- 2. Fetch Resource Data for Each Namespace ---
  progressCallback('Fetching resources for each namespace...');
  logger.info('Starting to fetch all resources for each namespace...');

  // Initialize data structures to store resource information
  const resourcesByNamespace: Record<string, Record<string, string[]>> = {};
  const fetchedOutputBlocks: Array<{ namespace: string; command: string; output: string }> = [];

  // Track resource counts by type - will be populated based on what we find
  const totalResourceCounts: Record<string, number> = {};

  // Get the resource types to fetch based on configuration
  const resourceTypes = resourceFilter.getResourceTypesToFetch(config);
  logger.info(`Will fetch the following resource types: ${resourceTypes.join(', ')}`);

  // Use Promise.all to fetch resource data for all namespaces concurrently for better performance
  await Promise.all(
    namespaceNames.map(async (namespace) => {
      try {
        // Get resource names by kind for the namespace using filtered resource types
        // Use resourceTypeAll for discovery if the types include "all", otherwise use specific types
        const typesToFetch = resourceTypes.includes('all') ? [resourceTypeAll] : resourceTypes;
        const resourcesByKind = await deps.getResourcesByName(namespace, typesToFetch, kubeconfigPath, context);

        // Store for the tree view
        resourcesByNamespace[namespace] = resourcesByKind;

        // Count resources by type
        for (const [kind, resources] of Object.entries(resourcesByKind)) {
          // Initialize the counter for this kind if needed
          if (totalResourceCounts[kind] === undefined) {
            totalResourceCounts[kind] = 0;
          }
          totalResourceCounts[kind] += resources.length;
        }

        // Get combined output for the filtered resource types in this namespace
        const hasAnyResources = Object.values(resourcesByKind).some((resources) => resources.length > 0);

        if (hasAnyResources) {
          logger.debug(`Fetching ${outputFormat} output for filtered resources in namespace '${namespace}'...`);
          const resourceData = await deps.getResourcesOutput(
            namespace,
            typesToFetch,
            kubeconfigPath,
            context,
            outputFormat,
          );

          // Only add if we got valid output data back
          if (resourceData.output) {
            // Process the output to redact secrets if needed based on the format
            let processedOutput = resourceData.output;

            if (config.security?.redactSecrets) {
              // Determine actual output format from command rather than config setting
              let actualFormat = outputFormat;

              // Check the command for the actual format used - more comprehensive checks
              const cmdStr = resourceData.command.toLowerCase();
              if (cmdStr.includes(' -o yaml') || cmdStr.includes(' --output=yaml') || cmdStr.includes(' --output yaml')) {
                actualFormat = 'yaml';
              } else if (cmdStr.includes(' -o json') || cmdStr.includes(' --output=json') || cmdStr.includes(' --output json')) {
                actualFormat = 'json';
              }
              
              // Debug logging to help diagnose format issues
              logger.debug(`Command used: "${resourceData.command}"`);
              logger.debug(`Output format from config: ${outputFormat}, detected format: ${actualFormat}`);
              logger.debug(`Output size before processing: ${resourceData.output.length} chars`);
              
              // Extra verification check for YAML content
              if (resourceData.output.trim().startsWith('apiVersion:') || resourceData.output.includes('\napiVersion:')) {
                logger.debug('Output appears to be YAML based on content inspection');
                if (actualFormat !== 'yaml') {
                  logger.warn('Content appears to be YAML but format detection says otherwise, forcing YAML processing');
                  actualFormat = 'yaml';
                }
              }

              // We already have this debug log higher up

              if (actualFormat === 'yaml') {
                logger.debug(`Redacting secrets in YAML output for namespace '${namespace}'...`);
                processedOutput = processResourceManifest(processedOutput, config);
              } else if (actualFormat === 'json') {
                logger.debug(`Redacting secrets in JSON output for namespace '${namespace}'...`);
                processedOutput = processJsonResourceManifest(processedOutput, config);
              } else {
                logger.debug(
                  `No redaction available for '${actualFormat}' format (text format redaction not supported)`,
                );
              }
            } else {
              logger.debug('Secret redaction disabled in config, skipping redaction');
            }

            fetchedOutputBlocks.push({
              namespace,
              command: resourceData.command,
              output: processedOutput,
            });
          }
        } else {
          logger.debug(`No resources found in namespace '${namespace}', skipping resource fetch.`);
        }
      } catch (error) {
        // Log error but continue with other namespaces (error resilience as per AC #10)
        logger.warn(`Error fetching resource data for namespace '${namespace}':`, error);
        // Initialize with empty objects for namespaces with errors
        resourcesByNamespace[namespace] = {};
      }
    }),
  );

  // Log resource counts
  const resourceSummary = Object.entries(totalResourceCounts)
    .filter(([_, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');

  logger.info(`Completed resource data fetch. Found ${resourceSummary} across ${namespaceNames.length} namespaces.`);

  // --- 3. Generate Output String ---
  progressCallback('Generating output file content...');
  const style = config.output?.style || 'markdown';
  logger.debug(`Using output style: ${style}`);
  let outputString: string;
  try {
    outputString = await deps.generateOutput(
      config,
      namespaceNames,
      namespaceData,
      resourcesByNamespace,
      fetchedOutputBlocks,
    );
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

  // Calculate total resources across all types
  const totalResources = Object.values(totalResourceCounts).reduce((sum, count) => sum + count, 0);

  const metrics: AggregationResult = {
    namespaceCount: namespaceNames.length,
    resourceCounts: totalResourceCounts,
    totalResourceCount: totalResources,
    // Add totalYamlSize etc. later
  };
  logger.trace('Calculated metrics:', metrics);

  // --- 7. Return Result ---
  logger.info('Kubernetes resource aggregation finished.');
  return metrics;
};
