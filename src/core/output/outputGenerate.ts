// src/core/output/outputGenerate.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';

// Assuming these exist/are adapted
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { KubeAggregatorError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import type { OutputGeneratorContext, PodDiagnostics, RenderContext } from './outputGeneratorTypes.js';
// Import adapted decorator functions
import {
  generateHeader,
  generateSummaryFileFormat,
  generateSummaryNotes,
  generateSummaryPurpose,
  generateSummaryUsageGuidelines,
} from './outputStyleDecorate.js';
// Import adapted style templates
import { getMarkdownTemplate } from './outputStyles/markdownStyle.js';
import { getPlainTemplate } from './outputStyles/plainStyle.js';
import { getXmlTemplate } from './outputStyles/xmlStyle.js';
import { generateResourceTreeString } from './resourceTreeGenerate.js';

/**
 * Creates the context object needed for rendering the output template.
 */
const createRenderContext = (outputGeneratorContext: OutputGeneratorContext): RenderContext => {
  const config = outputGeneratorContext.config;
  return {
    // Generated text based on config and runtime info
    generationHeader: generateHeader(config, outputGeneratorContext.generationDate),
    summaryPurpose: generateSummaryPurpose(),
    summaryFileFormat: generateSummaryFileFormat(),
    summaryUsageGuidelines: generateSummaryUsageGuidelines(config, outputGeneratorContext.instruction),
    summaryNotes: generateSummaryNotes(config),
    // Direct data passthrough
    headerText: undefined, // Not implemented in v1
    instruction: outputGeneratorContext.instruction,
    resourceTreeString: outputGeneratorContext.resourceTreeString,

    // Multi-resource data
    resources: outputGeneratorContext.resources,

    // Pod diagnostics (FRD-6)
    podDiagnostics: outputGeneratorContext.podDiagnostics,

    // Flags based on config (assuming these options exist or will be added)
    preambleEnabled: true, // Default to true for v1
    resourceTreeEnabled: true, // Default to true for v1
    diagnosticsEnabled: config.diagnostics?.includeFailingPods !== false, // Enable if not explicitly disabled

    // Legacy fields for backward compatibility, will be deprecated
    resourceKind: outputGeneratorContext.resourceKind,
    kubectlCommand: outputGeneratorContext.kubectlCommand,
    resourceOutput: outputGeneratorContext.resourceOutput,
  };
};

/**
 * Compiles and renders the output using Handlebars based on the chosen style.
 */
const generateHandlebarOutput = async (
  config: KubeAggregatorConfigMerged,
  renderContext: RenderContext,
): Promise<string> => {
  let templateString: string;
  // Ensure config.output and style exist
  const style = config.output?.style || 'markdown';

  switch (style) {
    case 'xml':
      templateString = getXmlTemplate();
      break;
    case 'markdown':
      templateString = getMarkdownTemplate();
      break;
    case 'plain':
      templateString = getPlainTemplate();
      break;
    default:
      // Fallback or error for unknown style
      logger.warn(`Unknown output style '${style}', defaulting to markdown.`);
      templateString = getMarkdownTemplate();
      break;
  }

  try {
    const compiledTemplate = Handlebars.compile(templateString);
    // Trim unnecessary whitespace and ensure final newline
    return `${compiledTemplate(renderContext).trim()}\n`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to compile or render Handlebars template for style '${style}': ${message}`);
    throw new KubeAggregatorError(`Template rendering failed: ${message}`);
  }
};

/**
 * Main function to generate the final output string.
 * Adapted for multi-resource handling with multiple resource types per namespace.
 */
export const generateOutput = async (
  config: KubeAggregatorConfigMerged,
  // --- Data for resources ---
  namespaceNames: string[], // List of names for the tree
  namespaceData: { output: string; command: string }, // Output and command for namespaces section
  // --- Extended for FRD-3 ---
  resourcesByNamespace?: Record<string, Record<string, string[]>> | Record<string, string[]>, // Map of namespace names to resource types and names
  fetchedOutputBlocks?:
    | Array<{ namespace: string; command: string; output: string }>
    | Record<string, { output: string; command: string }>, // Output data for namespaces
  // --- Extended for FRD-6 ---
  podDiagnostics?: PodDiagnostics[], // Diagnostic data for failing pods
  // --- Dependencies can be injected for testing ---
  deps = {
    buildOutputGeneratorContext,
    generateHandlebarOutput,
    // generateParsableXmlOutput, // Add later if needed
  },
): Promise<string> => {
  const style = config.output?.style || 'markdown';
  logger.info(`Generating output in ${style} format...`);

  // Build the main context object containing all data needed for generation
  const outputGeneratorContext = await deps.buildOutputGeneratorContext(
    config,
    namespaceNames,
    namespaceData,
    resourcesByNamespace,
    fetchedOutputBlocks,
    podDiagnostics,
  );

  // Create the specific context needed for Handlebars rendering
  const renderContext = createRenderContext(outputGeneratorContext);

  // Render the output using the appropriate template
  // Add parsable style handling later if needed
  // if (config.output.parsableStyle && config.output.style === 'xml') {
  //   return deps.generateParsableXmlOutput(renderContext);
  // }
  return deps.generateHandlebarOutput(config, renderContext);
};

/**
 * Helper function to construct the OutputGeneratorContext.
 * This centralizes the data gathering needed before template rendering.
 */
export const buildOutputGeneratorContext = async (
  config: KubeAggregatorConfigMerged,
  namespaceNames: string[],
  namespaceData: { output: string; command: string },
  resourcesByNamespace?: Record<string, Record<string, string[]>> | Record<string, string[]>,
  outputData?:
    | Array<{ namespace: string; command: string; output: string }>
    | Record<string, { output: string; command: string }>,
  podDiagnostics?: PodDiagnostics[],
): Promise<OutputGeneratorContext> => {
  // For v1, we don't implement instruction files
  const repositoryInstruction = '';

  // Generate the resource tree string with the appropriate resources
  // Handle both FRD-3 and backward compatibility with FRD-2
  const resourceTreeStr = generateResourceTreeString(namespaceNames, resourcesByNamespace);

  // Build the resources array starting with namespaces (global)
  const resources: (
    | import('./outputGeneratorTypes').ResourceData
    | import('./outputGeneratorTypes').NamespaceResourceBlock
  )[] = [
    {
      kind: 'Namespaces',
      command: namespaceData.command,
      output: namespaceData.output,
    },
  ];

  // Handle FRD-3 style (array of namespace resource blocks)
  if (Array.isArray(outputData)) {
    // These are namespace resource blocks from FRD-3
    for (const block of outputData) {
      if (block.output) {
        // Add these as namespace resource blocks
        resources.push(block);
      }
    }
  }
  // Handle FRD-2 style (map of namespace to pod output data)
  else if (outputData && !Array.isArray(outputData)) {
    // Assume this is the old pod data format from FRD-2
    for (const namespace of namespaceNames) {
      const podOutputData = outputData[namespace];

      // Only add if we have YAML data and it's not empty
      if (podOutputData?.output) {
        resources.push({
          kind: 'Pods',
          namespace,
          command: podOutputData.command,
          output: podOutputData.output,
        });
      }
    }
  }

  return {
    generationDate: new Date().toISOString(),
    resourceTreeString: resourceTreeStr,
    config,
    instruction: repositoryInstruction,
    // Multi-resource data
    resources,
    // Pod diagnostics (FRD-6)
    podDiagnostics,
    // Legacy fields for backward compatibility
    resourceKind: 'Namespaces',
    kubectlCommand: namespaceData.command,
    resourceOutput: namespaceData.output,
  };
};
