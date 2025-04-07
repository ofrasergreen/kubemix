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

  // Configuration Options
  config?: string; // Path to a custom config file
  // init?: boolean; // Add later if needed
  // global?: boolean; // Add later if needed

  // Other Options
  // version?: boolean; // Add later if needed
  verbose?: boolean; // Enable detailed logging
  quiet?: boolean; // Suppress informational output
}
