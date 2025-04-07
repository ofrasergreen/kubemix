// src/core/output/outputGeneratorTypes.ts
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js'; // Renamed

/**
 * Represents a single Kubernetes resource with its metadata and content
 */
export interface ResourceData {
  kind: string; // e.g., "Namespaces", "Pods"
  namespace?: string; // Only present for namespace-scoped resources
  command: string; // The kubectl command used to fetch this resource
  output: string; // The output content of the resource
}

/**
 * Represents a block of resources for a namespace.
 * Used by FRD-3 to represent multiple resource types fetched at once from a namespace.
 */
export interface NamespaceResourceBlock {
  namespace: string; // The namespace where these resources were fetched from
  command: string; // The kubectl command used to fetch these resources
  output: string; // The output content containing multiple resource types
}

/**
 * Represents diagnostic information for a failing pod.
 * Used by FRD-6 to capture detailed information for troubleshooting.
 */
export interface PodDiagnostics {
  // Pod identification
  namespace: string;
  podName: string;

  // Describe output
  describeCommand: string;
  description: string;

  // Current logs
  logsCommand: string;
  logs: string;

  // Previous logs (may not be available)
  prevLogsCommand?: string;
  prevLogs?: string;

  // Error information if any diagnostic command failed
  error?: string;
}

// Data context for generating the entire output file
export interface OutputGeneratorContext {
  generationDate: string;
  resourceTreeString: string; // Represents the overview (e.g., namespace list with multiple resource types)
  config: KubeAggregatorConfigMerged;
  instruction: string; // Content from instruction file

  // Resources can be a mix of:
  // 1. ResourceData (for global resources like Namespaces)
  // 2. NamespaceResourceBlock (for per-namespace resources from FRD-3)
  resources: (ResourceData | NamespaceResourceBlock)[];

  // Diagnostics for failing pods (FRD-6)
  podDiagnostics?: PodDiagnostics[];

  // --- Legacy fields for backward compatibility, will be deprecated ---
  resourceKind?: string; // e.g., "Namespaces"
  kubectlCommand?: string; // Command used, e.g., "kubectl get namespaces -o json"
  resourceOutput?: string; // The actual output from the command
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

  // Resources can be a mix of:
  // 1. ResourceData (for global resources like Namespaces)
  // 2. NamespaceResourceBlock (for per-namespace resources from FRD-3)
  readonly resources: ReadonlyArray<ResourceData | NamespaceResourceBlock>;

  // Diagnostics for failing pods (FRD-6)
  readonly podDiagnostics?: ReadonlyArray<PodDiagnostics>;

  // --- Flags based on config ---
  readonly preambleEnabled: boolean; // Controls if the summary section is included
  readonly resourceTreeEnabled: boolean; // Controls if the overview section is included
  readonly diagnosticsEnabled: boolean; // Controls if the diagnostics section is included

  // --- Legacy fields for backward compatibility, will be deprecated ---
  readonly resourceKind?: string;
  readonly kubectlCommand?: string;
  readonly resourceOutput?: string;
}
