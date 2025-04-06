// src/index.ts - Main module entry point
import { run } from './cli/cliRun.js';

// Export the CLI runner for programmatic access
export { run } from './cli/cliRun.js';

// Export the core functions for programmatic access
export { aggregateResources } from './core/packager.js';
export { generateOutput } from './core/output/outputGenerate.js';
export { getNamespacesYaml, getNamespaceNames } from './core/kubernetes/kubectlWrapper.js';

// Export configuration-related types for programmatic access
export type { KubeAggregatorConfigMerged } from './config/configSchema.js';

// Export error types for programmatic access
export { KubeAggregatorError, KubectlError } from './shared/errorHandle.js';

// We'll use the bin file as the entry point for the CLI, not this file
// This file is for programmatic usage