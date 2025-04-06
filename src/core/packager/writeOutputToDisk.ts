// src/core/packager/writeOutputToDisk.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { KubeAggregatorError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';

/**
 * Writes the generated output to disk at the specified path.
 * Creates any necessary directories in the process.
 *
 * @param outputString - The content to write to the file.
 * @param config - The merged configuration object containing the output path.
 * @returns A promise that resolves when the file is written.
 */
export const writeOutputToDisk = async (outputString: string, config: KubeAggregatorConfigMerged): Promise<void> => {
  // Ensure output exists and has a filePath
  if (!config.output || !config.output.filePath) {
    throw new KubeAggregatorError('Output file path is not defined in configuration');
  }

  const outputPath = config.output.filePath;
  const absoluteOutputPath = path.isAbsolute(outputPath) ? outputPath : path.resolve(config.cwd, outputPath);

  try {
    // Create the output directory if it doesn't exist
    const outputDir = path.dirname(absoluteOutputPath);
    await mkdir(outputDir, { recursive: true });

    // Write the output file
    await writeFile(absoluteOutputPath, outputString, 'utf8');
    logger.debug(`Output written to: ${absoluteOutputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to write output to ${absoluteOutputPath}: ${message}`);
    throw new KubeAggregatorError(`Failed to write output file: ${message}`);
  }
};
