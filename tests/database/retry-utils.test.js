/**
 * Tests for Retry Utils
 */

const { 
  withRetry,
  makeRetryable,
  isRetryableError,
  calculateBackoff,
  DEFAULT_RETRY_CONFIG
} = require('../../src/database/connection/retry-utils');

describe('Retry Utils', () => {
  // Mock timer functions
  jest.useFakeTimers();
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });
  
  test('isRetryableError should identify retryable errors by code', () => {
    const retryableError = new Error('Connection reset');
    retryableError.code = 'ECONNRESET';
    
    const nonRetryableError = new Error('Invalid SQL syntax');
    nonRetryableError.code = 'ER_PARSE_ERROR';
    
    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
  });
  
  test('isRetryableError should identify retryable errors by message', () => {
    const retryableError = new Error('Connection timeout occurred');
    const nonRetryableError = new Error('Invalid credentials');
    
    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
  });
  
  test('calculateBackoff should increase delay exponentially', () => {
    const config = {
      initialDelay: 100,
      maxDelay: 10000,
      factor: 2
    };
    
    const delay1 = calculateBackoff(1, config);
    const delay2 = calculateBackoff(2, config);
    const delay3 = calculateBackoff(3, config);
    
    // Check bounds with jitter (±10%)
    expect(delay1).toBeGreaterThanOrEqual(180); // 200 * 0.9
    expect(delay1).toBeLessThanOrEqual(220); // 200 * 1.1
    
    expect(delay2).toBeGreaterThanOrEqual(360); // 400 * 0.9
    expect(delay2).toBeLessThanOrEqual(440); // 400 * 1.1
    
    expect(delay3).toBeGreaterThanOrEqual(720); // 800 * 0.9
    expect(delay3).toBeLessThanOrEqual(880); // 800 * 1.1
  });
  
  test('calculateBackoff should respect maxDelay', () => {
    const config = {
      initialDelay: 1000,
      maxDelay: 5000,
      factor: 3
    };
    
    // 1000 * 3^3 = 27000, but should be capped at 5000
    const delay = calculateBackoff(3, config);
    
    expect(delay).toBeGreaterThanOrEqual(4500); // 5000 * 0.9
    expect(delay).toBeLessThanOrEqual(5500); // 5000 * 1.1
  });
  
  test('withRetry should retry on retryable errors', async () => {
    const retryableError = new Error('Connection reset');
    retryableError.code = 'ECONNRESET';
    
    const mockFn = jest.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('success');
    
    const promise = withRetry(mockFn, { initialDelay: 10, maxDelay: 100, factor: 2 });
    
    // Fast-forward timers to trigger retries
    jest.runAllTimers();
    
    const result = await promise;
    
    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result).toBe('success');
  });
  
  test('withRetry should not retry on non-retryable errors', async () => {
    const nonRetryableError = new Error('Invalid SQL syntax');
    nonRetryableError.code = 'ER_PARSE_ERROR';
    
    const mockFn = jest.fn().mockRejectedValue(nonRetryableError);
    
    await expect(withRetry(mockFn)).rejects.toThrow('Invalid SQL syntax');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
  
  test('withRetry should stop after reaching maxRetries', async () => {
    const retryableError = new Error('Connection reset');
    retryableError.code = 'ECONNRESET';
    
    const mockFn = jest.fn().mockRejectedValue(retryableError);
    
    const promise = withRetry(mockFn, { maxRetries: 3, initialDelay: 10 });
    
    // Fast-forward timers to trigger retries
    jest.runAllTimers();
    
    await expect(promise).rejects.toThrow('Connection reset');
    expect(mockFn).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });
  
  test('makeRetryable should return a retryable version of a function', async () => {
    const retryableError = new Error('Connection reset');
    retryableError.code = 'ECONNRESET';
    
    const mockFn = jest.fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('success');
    
    const retryableFn = makeRetryable(mockFn, { initialDelay: 10 });
    
    const promise = retryableFn('arg1', 'arg2');
    
    // Fast-forward timers to trigger retries
    jest.runAllTimers();
    
    const result = await promise;
    
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(result).toBe('success');
  });
});
