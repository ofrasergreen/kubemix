// src/shared/types.ts

/**
 * Callback function type for reporting progress during long operations.
 * Can be reused directly from Repomix.
 *
 * @param message - The progress message to report.
 */
export type ProgressCallback = (message: string) => void;

// Add other shared types here as the application grows.
// For example:
// export interface KubernetesResource {
//   apiVersion: string;
//   kind: string;
//   metadata: {
//     name: string;
//     namespace?: string;
//     [key: string]: any; // Allow other metadata fields
//   };
//   spec?: Record<string, any>;
//   data?: Record<string, string>; // Relevant for Secrets/ConfigMaps
//   status?: Record<string, any>;
// }