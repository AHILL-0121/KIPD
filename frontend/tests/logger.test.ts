import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('structured logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs info messages without throwing', () => {
    logger.info('System startup', { version: '1.0.0' });
    expect(logSpy).toHaveBeenCalled();
  });

  it('logs warn messages with context', () => {
    logger.warn('Rate limit approaching', { caller: '127.0.0.1' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('logs error messages with Error object', () => {
    const err = new Error('Database connection timeout');
    logger.error('Failed to connect to db', err, { tenantId: 't1' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('redacts sensitive keys in context', () => {
    logger.error('Auth failure', new Error('Bad password'), {
      password: 'supersecretpassword123',
      token: 'bearer_token_abc',
      nested: {
        secret: 'webhook_secret_key',
        safeData: 'visible_info',
      },
    });
    expect(errorSpy).toHaveBeenCalled();
    const callArgs = errorSpy.mock.calls[0];
    const stringified = JSON.stringify(callArgs);
    expect(stringified).not.toContain('supersecretpassword123');
    expect(stringified).not.toContain('webhook_secret_key');
    expect(stringified).toContain('[REDACTED]');
    expect(stringified).toContain('visible_info');
  });
});
