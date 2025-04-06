// src/core/output/outputGenerate.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';

// Assuming these exist/are adapted
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { KubeAggregatorError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import type { OutputGeneratorContext, RenderContext } from './outputGeneratorTypes.js';
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

    // Flags based on config (assuming these options exist or will be added)
    preambleEnabled: true, // Default to true for v1
    resourceTreeEnabled: true, // Default to true for v1

    // Legacy fields for backward compatibility, will be deprecated
    resourceKind: outputGeneratorContext.resourceKind,
    kubectlCommand: outputGeneratorContext.kubectlCommand,
    resourceYamlOutput: outputGeneratorContext.resourceYamlOutput,
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
  namespaceYamlData: { yaml: string; command: string }, // YAML and command for namespaces section
  // --- Extended for FRD-3 ---
  resourcesByNamespace?: Record<string, Record<string, string[]>> | Record<string, string[]>, // Map of namespace names to resource types and names
  fetchedYamlBlocks?:
    | Array<{ namespace: string; command: string; yaml: string }>
    | Record<string, { yaml: string; command: string }>, // YAML data for namespaces
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
    namespaceYamlData,
    resourcesByNamespace,
    fetchedYamlBlocks,
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
  namespaceYamlData: { yaml: string; command: string },
  resourcesByNamespace?: Record<string, Record<string, string[]>> | Record<string, string[]>,
  yamlData?:
    | Array<{ namespace: string; command: string; yaml: string }>
    | Record<string, { yaml: string; command: string }>,
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
      command: namespaceYamlData.command,
      yaml: namespaceYamlData.yaml,
    },
  ];

  // Handle FRD-3 style (array of namespace resource blocks)
  if (Array.isArray(yamlData)) {
    // These are namespace resource blocks from FRD-3
    for (const block of yamlData) {
      if (block.yaml) {
        // Add these as namespace resource blocks
        resources.push(block);
      }
    }
  }
  // Handle FRD-2 style (map of namespace to pod yaml data)
  else if (yamlData && !Array.isArray(yamlData)) {
    // Assume this is the old pod data format from FRD-2
    for (const namespace of namespaceNames) {
      const podYamlData = yamlData[namespace];

      // Only add if we have YAML data and it's not empty
      if (podYamlData?.yaml) {
        resources.push({
          kind: 'Pods',
          namespace,
          command: podYamlData.command,
          yaml: podYamlData.yaml,
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
    // Legacy fields for backward compatibility
    resourceKind: 'Namespaces',
    kubectlCommand: namespaceYamlData.command,
    resourceYamlOutput: namespaceYamlData.yaml,
  };
};
