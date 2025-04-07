import { z } from 'zod';

// --- Output Configuration ---

// Define possible output styles
export const kubeAggregatorOutputStyleSchema = z.enum(['markdown', 'xml', 'plain']);
export type KubeAggregatorOutputStyle = z.infer<typeof kubeAggregatorOutputStyleSchema>;

// Map styles to default file names
export const defaultFilePathMap: Record<KubeAggregatorOutputStyle, string> = {
  markdown: 'kubemix-output.md',
  xml: 'kubemix-output.xml',
  plain: 'kubemix-output.txt',
} as const;

// --- Kubernetes Configuration ---

// Define possible kubectl output formats
export const kubectlOutputFormatSchema = z.enum(['text', 'yaml', 'json']);
export type KubectlOutputFormat = z.infer<typeof kubectlOutputFormatSchema>;

// Schema for Kubernetes connection/targeting options
const kubernetesConfigSchema = z.object({
  kubeconfigPath: z.string().optional().describe('Path to the kubeconfig file'),
  context: z.string().optional().describe('Specific Kubernetes context to use'),
  outputFormat: kubectlOutputFormatSchema.optional().describe('Output format for kubectl commands'),
  // Add more specific Kube options later (e.g., cluster URL, token)
});

// --- Include/Exclude Configuration ---

// Schema for defining resource types or names to include/exclude
const filterSchema = z.object({
  // Namespaces to include (if empty, include all allowed namespaces)
  namespaces: z.array(z.string()).optional().describe('List of namespaces to include'),
  // Resource types to include (e.g., ['pods', 'services', 'deployments'])
  // If empty, potentially include all discoverable/supported types based on other filters.
  includeResourceTypes: z
    .array(z.string())
    .optional()
    .describe('List of resource types to include (e.g., pods, services)'),
  // Resource types to exclude
  excludeResourceTypes: z.array(z.string()).optional().describe('List of resource types to exclude'),
  // Namespaces to exclude (higher priority than include)
  excludeNamespaces: z.array(z.string()).optional().describe('List of namespaces to explicitly exclude'),
  // Label selector string (e.g., 'app=myapp,env=production')
  labelSelector: z.string().optional().describe('Kubernetes label selector'),
  // Field selector string (e.g., 'status.phase=Running')
  fieldSelector: z.string().optional().describe('Kubernetes field selector'),
});

// --- Security/Redaction Configuration ---

// Schema for redaction options (placeholder for now)
const securityConfigSchema = z.object({
  redactSecrets: z.boolean().optional().describe('Whether to redact data in Secret resources'),
  // Add more fine-grained redaction options later
});

// Schema for diagnostics options
const diagnosticsConfigSchema = z.object({
  includeFailingPods: z.boolean().optional().describe('Whether to include diagnostics for failing pods'),
  podLogTailLines: z.number().int().positive().optional().describe('Number of log lines to fetch for failing pods'),
});

// --- Base Configuration Schema (Common Structure) ---

// Defines the structure applicable to file config and CLI partial config
export const kubeAggregatorConfigBaseSchema = z.object({
  output: z
    .object({
      filePath: z.string().optional().describe('Path to the output file'),
      style: kubeAggregatorOutputStyleSchema.optional().describe('Output format style'),
      // Add options similar to Repomix if needed later:
      // parsableStyle: z.boolean().optional(),
      // headerText: z.string().optional(),
      // instructionFilePath: z.string().optional(),
      // preamble: z.boolean().optional(), // Renamed from fileSummary
      // resourceTree: z.boolean().optional(), // Renamed from directoryStructure
    })
    .strict() // Ensure no extra properties
    .optional(),
  kubernetes: kubernetesConfigSchema.strict().optional(),
  filter: filterSchema.strict().optional(),
  security: securityConfigSchema.strict().optional(),
  diagnostics: diagnosticsConfigSchema.strict().optional(),
});

// --- Default Configuration Schema ---

// Defines the complete configuration structure with default values
export const kubeAggregatorConfigDefaultSchema = z.object({
  output: z
    .object({
      filePath: z.string().default(defaultFilePathMap.markdown), // Default to markdown
      style: kubeAggregatorOutputStyleSchema.default('markdown'), // Default to markdown
      // preamble: z.boolean().default(true),
      // resourceTree: z.boolean().default(true),
    })
    .default({}), // Provide default object if output is undefined
  kubernetes: kubernetesConfigSchema
    .extend({
      outputFormat: kubectlOutputFormatSchema.default('text'),
    })
    .default({}),
  filter: filterSchema
    .extend({
      // Default exclusions (can be overridden)
      excludeNamespaces: z.array(z.string()).default(['kube-system', 'kube-public', 'kube-node-lease']),
      excludeResourceTypes: z.array(z.string()).default(['events']), // Often noisy
    })
    .default({}),
  security: securityConfigSchema
    .extend({
      redactSecrets: z.boolean().default(true), // Default to redacting secrets
    })
    .default({}),
  diagnostics: diagnosticsConfigSchema
    .extend({
      includeFailingPods: z.boolean().default(true), // Default to including diagnostics for failing pods
      podLogTailLines: z.number().int().positive().default(50), // Default to 50 lines of logs
    })
    .default({}),
});

// --- Specific Configuration Schemas ---

// Schema for the configuration file (kube-aggregator.config.json)
// It directly uses the base schema as it allows partial definitions
export const kubeAggregatorConfigFileSchema = kubeAggregatorConfigBaseSchema;

// Schema for the configuration derived purely from CLI arguments
// Also uses the base schema
export const kubeAggregatorConfigCliSchema = kubeAggregatorConfigBaseSchema;

// --- Merged Configuration Schema ---

// Defines the final, validated, and defaulted configuration object used by the application
export const kubeAggregatorConfigMergedSchema = kubeAggregatorConfigDefaultSchema
  // Overlay file config onto defaults
  .merge(kubeAggregatorConfigFileSchema)
  // Overlay CLI config onto the result
  .merge(kubeAggregatorConfigCliSchema)
  // Add runtime properties like cwd
  .extend({
    cwd: z.string().describe('Current working directory where the tool was invoked'),
  });

// --- Exported Types ---

export type KubeAggregatorConfigDefault = z.infer<typeof kubeAggregatorConfigDefaultSchema>;
export type KubeAggregatorConfigFile = z.infer<typeof kubeAggregatorConfigFileSchema>;
export type KubeAggregatorConfigCli = z.infer<typeof kubeAggregatorConfigCliSchema>;
export type KubeAggregatorConfigMerged = z.infer<typeof kubeAggregatorConfigMergedSchema>;

// Export the fully parsed default configuration object
export const defaultConfig = kubeAggregatorConfigDefaultSchema.parse({});
