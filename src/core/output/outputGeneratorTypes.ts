// src/core/output/outputGeneratorTypes.ts
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js'; // Renamed

/**
 * Represents a single Kubernetes resource with its metadata and content
 */
export interface ResourceData {
  kind: string; // e.g., "Namespaces", "Pods"
  namespace?: string; // Only present for namespace-scoped resources
  command: string; // The kubectl command used to fetch this resource
  yaml: string; // The YAML content of the resource
}

// Data context for generating the entire output file
export interface OutputGeneratorContext {
  generationDate: string;
  resourceTreeString: string; // Represents the overview (e.g., namespace list with pods)
  config: KubeAggregatorConfigMerged;
  instruction: string; // Content from instruction file

  // New multi-resource structure
  resources: ResourceData[];

  // --- Legacy fields for backward compatibility, will be deprecated ---
  resourceKind?: string; // e.g., "Namespaces"
  kubectlCommand?: string; // Command used, e.g., "kubectl get namespaces -o yaml"
  resourceYamlOutput?: string; // The actual YAML output from the command
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

  // New multi-resource structure
  readonly resources: ReadonlyArray<ResourceData>;

  // --- Flags based on config ---
  readonly preambleEnabled: boolean; // Controls if the summary section is included
  readonly resourceTreeEnabled: boolean; // Controls if the overview section is included

  // --- Legacy fields for backward compatibility, will be deprecated ---
  readonly resourceKind?: string;
  readonly kubectlCommand?: string;
  readonly resourceYamlOutput?: string;
}
