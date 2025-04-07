// src/core/packager.ts

import * as yaml from 'yaml';
import type { AggregationResult } from '../cli/actions/namespaceAction.js'; // Use the result type defined in the action
// --- Adapted Kubernetes Config/Types ---
import type { KubeAggregatorConfigMerged } from '../config/configSchema.js'; // Renamed
import { TokenCounter } from './tokenCount/tokenCount.js';

// --- Adapted Kubernetes Core Modules ---
import * as kubectlWrapper from './kubernetes/kubectlWrapper.js';
import * as resourceFilter from './kubernetes/resourceFilter.js';
import * as outputGenerator from './output/outputGenerate.js';
import type { PodDiagnostics } from './output/outputGeneratorTypes.js';
import * as clipboardCopier from './packager/copyToClipboardIfEnabled.js'; // Assuming adapted version
// import * as metricsCalculator from './metrics/calculateMetrics.js'; // Keep commented for now
import * as outputWriter from './packager/writeOutputToDisk.js'; // Assuming adapted version
import { processJsonResourceManifest, processResourceManifest } from './processing/resourceProcessor.js';

// Use 'all' to fetch all common resource types at once
const resourceTypeAll = 'all';

// --- Shared Modules ---
import { logger } from '../shared/logger.js';
import type { ProgressCallback } from '../shared/types.js';
import { isPodFailing } from './kubernetes/resourceFilter.js';

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
    describePod: kubectlWrapper.describePod,
    getPodLogs: kubectlWrapper.getPodLogs,
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
        } else if (
          cmdStr.includes(' -o json') ||
          cmdStr.includes(' --output=json') ||
          cmdStr.includes(' --output json')
        ) {
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
              if (
                cmdStr.includes(' -o yaml') ||
                cmdStr.includes(' --output=yaml') ||
                cmdStr.includes(' --output yaml')
              ) {
                actualFormat = 'yaml';
              } else if (
                cmdStr.includes(' -o json') ||
                cmdStr.includes(' --output=json') ||
                cmdStr.includes(' --output json')
              ) {
                actualFormat = 'json';
              }

              // Debug logging to help diagnose format issues
              logger.debug(`Command used: "${resourceData.command}"`);
              logger.debug(`Output format from config: ${outputFormat}, detected format: ${actualFormat}`);
              logger.debug(`Output size before processing: ${resourceData.output.length} chars`);

              // Extra verification check for YAML content
              if (
                resourceData.output.trim().startsWith('apiVersion:') ||
                resourceData.output.includes('\napiVersion:')
              ) {
                logger.debug('Output appears to be YAML based on content inspection');
                if (actualFormat !== 'yaml') {
                  logger.warn(
                    'Content appears to be YAML but format detection says otherwise, forcing YAML processing',
                  );
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

  // --- 3. Find Failing Pods & Gather Diagnostics (FRD-6) ---
  const podDiagnostics: PodDiagnostics[] = [];

  // Only do this if diagnostics are enabled in the config
  if (config.diagnostics?.includeFailingPods !== false) {
    progressCallback('Checking for failing pods and gathering diagnostics...');
    logger.info('Identifying failing pods for diagnostics...');

    // Look through all fetched output blocks to find pod manifests
    // For each namespace with resource data, try to parse the output to find pods
    for (const resourceBlock of fetchedOutputBlocks) {
      const namespace = resourceBlock.namespace;
      const output = resourceBlock.output;

      // Skip if the output is empty
      if (!output) continue;

      // Skip if the output doesn't appear to be a format we can parse
      // First, check the output format based on the command
      let outputFormat: 'yaml' | 'json' | 'text' = 'text';

      if (resourceBlock.command.includes(' -o yaml') || resourceBlock.command.includes(' --output=yaml')) {
        outputFormat = 'yaml';
      } else if (resourceBlock.command.includes(' -o json') || resourceBlock.command.includes(' --output=json')) {
        outputFormat = 'json';
      } else {
        // Skip formats we can't reliably parse
        logger.debug(
          `Skipping diagnostic check for '${namespace}' due to unprocessable output format: ${outputFormat}`,
        );
        continue;
      }

      // Now try to parse the output to find failing pods
      try {
        let resources: any[] = [];

        if (outputFormat === 'yaml') {
          // Parse as YAML
          const documents = yaml.parseAllDocuments(output);
          resources = documents.map((doc: any) => doc.toJSON()).filter(Boolean);
        } else if (outputFormat === 'json') {
          // Parse as JSON
          const parsed = JSON.parse(output);
          // Handle both single resources and lists
          if (parsed.items && Array.isArray(parsed.items)) {
            resources = parsed.items;
          } else if (parsed.kind) {
            resources = [parsed];
          }
        }

        // Function to recursively find failing pods
        const findFailingPods = (resource: any, ns: string): Array<{ namespace: string; podName: string }> => {
          const result: Array<{ namespace: string; podName: string }> = [];

          // Check if this is a Pod
          if (resource.kind === 'Pod') {
            // Use resource namespace if available, otherwise use parent namespace
            const podNamespace = resource.metadata?.namespace || ns;

            // Check if this pod is failing
            if (isPodFailing(resource)) {
              const podName = resource.metadata?.name;
              if (podName) {
                logger.info(`Found failing pod: ${podNamespace}/${podName}, scheduling diagnostics`);
                result.push({ namespace: podNamespace, podName });
              }
            }
          }
          // Check if this is a List that might contain pods
          else if (resource.kind?.endsWith('List') && resource.items && Array.isArray(resource.items)) {
            // Process each item in the list
            for (const item of resource.items) {
              // For each item, recursively find failing pods and add them to our result
              const itemResults = findFailingPods(item, ns);
              result.push(...itemResults);
            }
          }

          return result;
        };

        // Find all failing pods in the resources
        const failingPods = resources.flatMap((resource) => findFailingPods(resource, namespace));

        // Process each failing pod
        for (const { namespace, podName } of failingPods) {
          logger.info(`Processing diagnostics for failing pod: ${namespace}/${podName}`);

          // Fetch diagnostic data for this pod
          try {
            // Fetch pod description
            const podLogLines = config.diagnostics?.podLogTailLines ?? 50;
            logger.debug(`Fetching description for pod ${namespace}/${podName}`);
            const describeResult = await deps.describePod(namespace, podName, kubeconfigPath, context);

            // Fetch current logs
            logger.debug(`Fetching logs for pod ${namespace}/${podName} (${podLogLines} lines)`);
            const logsResult = await deps.getPodLogs(namespace, podName, podLogLines, false, kubeconfigPath, context);

            // Fetch previous logs (if any)
            logger.debug(`Fetching previous logs for pod ${namespace}/${podName} (${podLogLines} lines)`);
            const prevLogsResult = await deps.getPodLogs(
              namespace,
              podName,
              podLogLines,
              true,
              kubeconfigPath,
              context,
            );

            // Add the diagnostic data to our array
            podDiagnostics.push({
              namespace,
              podName,
              describeCommand: describeResult.command,
              description: describeResult.description,
              logsCommand: logsResult.command,
              logs: logsResult.logs,
              prevLogsCommand: prevLogsResult.command,
              prevLogs: prevLogsResult.logs,
            });
          } catch (error) {
            // If any part of the diagnostic gathering fails, add what we have with an error note
            logger.warn(`Error gathering diagnostic data for pod ${namespace}/${podName}:`, error);

            podDiagnostics.push({
              namespace,
              podName,
              // Add whatever we have
              describeCommand: `kubectl describe pod ${podName} -n ${namespace}`,
              description: 'Error fetching pod description',
              logsCommand: `kubectl logs ${podName} -n ${namespace} --tail=${config.diagnostics?.podLogTailLines ?? 50}`,
              logs: 'Error fetching logs',
              error: error instanceof Error ? error.message : 'Unknown error during diagnostics',
            });
          }
        }
      } catch (error) {
        logger.warn(`Error parsing output for pod diagnostics in namespace '${namespace}':`, error);
      }
    }

    if (podDiagnostics.length > 0) {
      logger.info(`Found ${podDiagnostics.length} failing pods requiring diagnostics`);
    } else {
      logger.info('No failing pods found that require diagnostics');
    }
  } else {
    logger.debug('Pod diagnostics disabled in config, skipping diagnostics');
  }

  // --- 4. Generate Output String ---
  progressCallback('Generating output file content...');
  const style = config.output?.style || 'markdown';
  logger.debug(`Using output style: ${style}`);

  // Initialize token counter
  const tokenCounter = new TokenCounter(config.tokenCount?.encoding || 'o200k_base');

  let outputString: string;
  try {
    outputString = await deps.generateOutput(
      config,
      namespaceNames,
      namespaceData,
      resourcesByNamespace,
      fetchedOutputBlocks,
      podDiagnostics.length > 0 ? podDiagnostics : undefined,
    );
  } catch (error) {
    logger.error('Failed to generate output content.', error);
    // Free token counter resources
    tokenCounter.free();
    throw error; // Propagate
  }

  // Calculate metrics on the output
  const totalCharacters = outputString.length;
  let totalTokens = 0;

  try {
    // Count tokens
    progressCallback('Calculating token count...');
    totalTokens = tokenCounter.countTokens(outputString);
    logger.debug(`Calculated token count: ${totalTokens.toLocaleString()} tokens`);
  } catch (error) {
    logger.warn('Failed to calculate token count:', error);
    // Non-critical error, continue with process
  }

  logger.trace(
    `Generated output string length: ${totalCharacters.toLocaleString()} chars, ~${totalTokens.toLocaleString()} tokens`,
  );

  // --- 5. Write Output to Disk ---
  const filePath = config.output?.filePath || 'kubemix-output.md';
  progressCallback(`Writing output to ${filePath}...`);
  try {
    await deps.writeOutputToDisk(outputString, config);
    logger.info(`Output successfully written to ${filePath}`);
  } catch (error) {
    logger.error(`Failed to write output file to ${filePath}`, error);
    throw error; // Propagate
  }

  // --- 6. Copy to Clipboard (Optional) ---
  // Assuming the adapted function checks config.output.copyToClipboard
  try {
    await deps.copyToClipboardIfEnabled(outputString, progressCallback, config);
  } catch (error) {
    // Log clipboard error but don't fail the whole process
    logger.warn(`Failed to copy output to clipboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // --- 7. Calculate Metrics ---
  progressCallback('Calculating metrics...');

  // Calculate total resources across all types
  const totalResources = Object.values(totalResourceCounts).reduce((sum, count) => sum + count, 0);

  // Determine if secrets were found and processed
  // This is a simplification - a more accurate implementation would track if secrets were actually found
  const secretsFound = config.security?.redactSecrets === true;

  const metrics: AggregationResult = {
    namespaceCount: namespaceNames.length,
    resourceCounts: totalResourceCounts,
    totalResourceCount: totalResources,
    // Add token counting metrics (FRD-7)
    totalCharacters,
    totalTokens,
    secretsFound,
  };
  logger.trace('Calculated metrics:', metrics);

  // --- 8. Return Result ---
  logger.info('Kubernetes resource aggregation finished.');

  // Free token counter resources
  try {
    tokenCounter.free();
  } catch (error) {
    logger.debug('Error freeing token counter resources:', error);
  }

  return metrics;
};
