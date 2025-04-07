// src/core/tokenCount/tokenCount.test.ts

import { describe, it, expect, afterEach, vi } from 'vitest';
import { TokenCounter, countTokens } from './tokenCount.js';

// Mock the logger to avoid console output during tests
vi.mock('../../shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    log: vi.fn(),
  },
}));

describe('TokenCounter', () => {
  // Create a reusable token counter for tests
  let tokenCounter: TokenCounter;
  
  // Clean up after each test
  afterEach(() => {
    if (tokenCounter) {
      tokenCounter.free();
    }
  });
  
  it('should initialize with default encoding', () => {
    tokenCounter = new TokenCounter();
    expect(tokenCounter).toBeInstanceOf(TokenCounter);
  });
  
  it('should count tokens correctly for short text', () => {
    tokenCounter = new TokenCounter();
    const text = 'Hello world';
    const tokens = tokenCounter.countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10); // Should be around 2-3 tokens
  });
  
  it('should count tokens correctly for longer text', () => {
    tokenCounter = new TokenCounter();
    const text = 'This is a longer piece of text that should be tokenized into multiple tokens. The tokenizer should split this into many pieces.';
    const tokens = tokenCounter.countTokens(text);
    expect(tokens).toBeGreaterThan(10);
  });
  
  it('should handle empty string gracefully', () => {
    tokenCounter = new TokenCounter();
    const tokens = tokenCounter.countTokens('');
    expect(tokens).toBe(0);
  });
  
  it('should initialize with different encoding models', () => {
    // Test with different models
    const models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4o'];
    
    for (const model of models) {
      const counter = new TokenCounter(model);
      const tokens = counter.countTokens('Hello world');
      expect(tokens).toBeGreaterThan(0);
      counter.free();
    }
  });
});

describe('countTokens utility function', () => {
  it('should count tokens correctly', () => {
    const text = 'Hello world';
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });
  
  it('should handle empty string gracefully', () => {
    const tokens = countTokens('');
    expect(tokens).toBe(0);
  });
  
  it('should work with different model parameters', () => {
    const models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4o'] as const;
    
    for (const model of models) {
      const tokens = countTokens('Hello world', model);
      expect(tokens).toBeGreaterThan(0);
    }
  });
});