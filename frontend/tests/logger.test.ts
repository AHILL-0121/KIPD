import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
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

  it('forwards error events to Sentry with redacted extras when SENTRY_DSN is set', () => {
    const prevDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/123';
    const captureSpy = vi.spyOn(Sentry, 'captureException');
    const extrasSpy = vi.fn();
    vi.spyOn(Sentry, 'withScope').mockImplementation((cb: any) => {
      cb({ setTag: vi.fn(), setExtras: extrasSpy, setExtra: vi.fn() });
      return '';
    });

    try {
      const err = new Error('Unhandled failure');
      logger.error('Request failed', err, { tenantId: 't1', secret: 'raw-secret' });
      expect(captureSpy).toHaveBeenCalledWith(err);
      expect(extrasSpy).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', secret: '[REDACTED]' }));
    } finally {
      if (prevDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = prevDsn;
    }
  });
});
