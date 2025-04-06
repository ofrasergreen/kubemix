// src/core/output/outputGeneratorTypes.ts
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js'; // Renamed

// Data context for generating the entire output file
export interface OutputGeneratorContext {
  generationDate: string;
  resourceTreeString: string; // Represents the overview (e.g., namespace list)
  config: KubeAggregatorConfigMerged;
  instruction: string; // Content from instruction file
  // --- Data specific to the initial namespace feature ---
  resourceKind: string; // e.g., "Namespaces"
  kubectlCommand: string; // Command used, e.g., "kubectl get namespaces -o yaml"
  resourceYamlOutput: string; // The actual YAML output from the command
  // --- Placeholder for future multi-resource handling ---
  // resources: Array<{
  //   kind: string;
  //   metadata: { name: string; namespace?: string };
  //   yaml: string;
  //   command: string;
  // }>;
}

// Data context specifically for rendering the Handlebars template
export interface RenderContext {
  readonly generationHeader: string;
  readonly summaryPurpose: string;
  readonly summaryFileFormat: string;
  readonly summaryUsageGuidelines: string;
  readonly summaryNotes: string;
  readonly headerText: string | undefined;
  readonly instruction: string;
  readonly resourceTreeString: string;
  // --- Data specific to the initial namespace feature ---
  readonly resourceKind: string;
  readonly kubectlCommand: string;
  readonly resourceYamlOutput: string;
  // --- Flags based on config ---
  readonly preambleEnabled: boolean; // Controls if the summary section is included
  readonly resourceTreeEnabled: boolean; // Controls if the overview section is included
  // --- Placeholder for future multi-resource handling ---
  // readonly resources: ReadonlyArray<OutputGeneratorContext['resources'][0]>;
}