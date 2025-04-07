// src/core/tokenCount/tokenCount.ts

import * as tiktoken from 'tiktoken';
import { logger } from '../../shared/logger.js';

// Define types for model names we support
type SupportedModel = Extract<tiktoken.TiktokenModel, 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4o' | 'gpt-4-turbo'>;

// Define constant maps for model to encoding
const MODEL_TO_ENCODING: Record<string, tiktoken.TiktokenEncoding> = {
  'gpt-4': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4-turbo': 'cl100k_base',
};

/**
 * TokenCounter class for estimating the token count of a string
 * using the tiktoken library.
 */
export class TokenCounter {
  private encoder: tiktoken.Tiktoken | null = null;
  private encodingName: string;

  /**
   * Creates a new TokenCounter instance.
   *
   * @param encodingOrModel - The name of the encoding or model to use
   */
  constructor(encodingOrModel = 'gpt-4o') {
    this.encodingName = encodingOrModel;
    try {
      // Try to use as model first
      this.encoder = tiktoken.encoding_for_model(encodingOrModel as SupportedModel);
      logger.debug(`Initialized TokenCounter with model: ${encodingOrModel}`);
    } catch (error) {
      // If model fails, try as encoding
      try {
        // Check if the encoding string matches our supported encodings
        if (encodingOrModel === 'cl100k_base' || encodingOrModel === 'o200k_base') {
          this.encoder = tiktoken.get_encoding(encodingOrModel);
          logger.debug(`Initialized TokenCounter with encoding: ${encodingOrModel}`);
        } else {
          // Default to GPT-4o which uses o200k_base
          logger.debug(`Unknown encoding "${encodingOrModel}", falling back to gpt-4o (o200k_base)`);
          this.encoder = tiktoken.encoding_for_model('gpt-4o');
          this.encodingName = 'gpt-4o';
        }
      } catch (fallbackError) {
        logger.warn('Failed to initialize tiktoken encoder:', fallbackError);
        this.encoder = null;
      }
    }
  }

  /**
   * Counts the estimated number of tokens in a string.
   *
   * @param text - The text to count tokens for
   * @returns The number of tokens, or 0 if tokenization fails
   */
  countTokens(text: string): number {
    if (!text) return 0;

    if (!this.encoder) {
      logger.warn('Token counting is unavailable - encoder not initialized');
      return 0;
    }

    try {
      const tokens = this.encoder.encode(text);
      return tokens.length;
    } catch (error) {
      logger.warn(`Error counting tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  /**
   * Frees the encoder resources.
   * Important to call this when done to prevent memory leaks.
   */
  free(): void {
    if (this.encoder) {
      try {
        this.encoder.free();
        this.encoder = null;
        logger.debug('TokenCounter resources freed');
      } catch (error) {
        logger.warn(`Error freeing token encoder: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}

/**
 * Utility function to count tokens in a given text.
 * This is a simpler alternative to using the TokenCounter class.
 *
 * @param text - The text to count tokens for
 * @param modelName - The model to use for tokenization (defaults to 'gpt-4o')
 * @returns The number of tokens, or 0 if tokenization fails
 */
export const countTokens = (text: string, modelName: SupportedModel = 'gpt-4o'): number => {
  if (!text) return 0;

  let encoder: tiktoken.Tiktoken | null = null;

  try {
    // Use the model directly
    encoder = tiktoken.encoding_for_model(modelName);
    const tokens = encoder.encode(text);
    const count = tokens.length;
    return count;
  } catch (error) {
    // Try fallback to gpt-4o
    try {
      if (modelName !== 'gpt-4o') {
        logger.debug(`Failed to get encoding for ${modelName}, falling back to gpt-4o`);
        encoder = tiktoken.encoding_for_model('gpt-4o');
        const tokens = encoder.encode(text);
        const count = tokens.length;
        return count;
      }
    } catch (fallbackError) {
      // Just log and return 0 at this point
    }

    logger.warn(`Error counting tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 0;
  } finally {
    // Free the encoder resources to prevent memory leaks
    if (encoder) {
      try {
        encoder.free();
      } catch (freeError) {
        logger.debug(
          `Error freeing token encoder: ${freeError instanceof Error ? freeError.message : 'Unknown error'}`,
        );
      }
    }
  }
};
