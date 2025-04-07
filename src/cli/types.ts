import type { OptionValues } from 'commander';

// Define the structure for CLI options parsed by Commander
export interface CliOptions extends OptionValues {
  // Output Options
  output?: string; // Path for the output file
  style?: string; // Output style (e.g., 'markdown', 'xml', 'plain') - defaulting to markdown for now

  // Kubernetes Specific Options
  kubeconfig?: string; // Path to kubeconfig file
  context?: string; // Kubernetes context to use
  format?: string; // Output format for kubectl commands (text, yaml, json)

  // Filtering Options
  namespace?: string; // Namespaces to include, comma-separated
  excludeNamespace?: string; // Namespaces to exclude, comma-separated
  includeType?: string; // Resource types to include, comma-separated
  excludeType?: string; // Resource types to exclude, comma-separated

  // Security Options
  noRedactSecrets?: boolean; // Disable redaction of Secret data

  // Diagnostics Options
  noDiagnostics?: boolean; // Disable diagnostics for failing pods
  podLogLines?: number; // Number of log lines to fetch for failing pods

  // Configuration Options
  config?: string; // Path to a custom config file
  // init?: boolean; // Add later if needed
  // global?: boolean; // Add later if needed

  // Other Options
  // version?: boolean; // Add later if needed
  verbose?: boolean; // Enable detailed logging
  quiet?: boolean; // Suppress informational output
}
