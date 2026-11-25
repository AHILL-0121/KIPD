/**
 * Production-ready structured logger and error tracking utility.
 * Supports structured JSON logs in production, pretty-printing in development,
 * sensitive field redaction, and Sentry error forwarding via @sentry/nextjs.
 */
import * as Sentry from '@sentry/nextjs';

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  tenantId?: string;
  userId?: string;
  route?: string;
  action?: string;
  [key: string]: unknown;
}

const REDACT_KEYS = new Set([
  'password',
  'token',
  'secret',
  'keysecret',
  'webhooksecret',
  'authorization',
  'cookie',
  'creditcard',
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redact(item, depth + 1));
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = redact(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: formatError(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}

class Logger {
  private isProduction = process.env.NODE_ENV === 'production';
  private get sentryDsn() {
    return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  }

  private emit(level: LogLevel, message: string, error?: unknown, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const formattedError = error ? formatError(error) : undefined;
    const cleanContext = context ? (redact(context) as LogContext) : undefined;

    if (this.isProduction) {
      const entry = {
        timestamp,
        level,
        message,
        ...(formattedError ? { error: formattedError } : {}),
        ...(cleanContext ? { context: cleanContext } : {}),
      };
      // Single-line JSON output for log aggregators (CloudWatch, Datadog, Vercel)
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry));
    } else {
      const prefix = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      if (level === 'error') {
        console.error(prefix, error ?? '', cleanContext ?? '');
      } else if (level === 'warn') {
        console.warn(prefix, cleanContext ?? '');
      } else {
        console.log(prefix, cleanContext ?? '');
      }
    }

    // Forward errors to Sentry on both server and browser when DSN is configured
    if (level === 'error' && this.sentryDsn) {
      this.sendToSentry(message, error, cleanContext);
    }
  }

  private sendToSentry(message: string, error?: unknown, context?: LogContext) {
    if (!this.sentryDsn) return;
    try {
      Sentry.withScope((scope) => {
        if (context?.tenantId) scope.setTag('tenantId', String(context.tenantId));
        if (context?.route) scope.setTag('route', String(context.route));
        if (context) scope.setExtras(context);
        scope.setExtra('loggerMessage', message);

        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureMessage(error ? `${message}: ${String(error)}` : message, 'error');
        }
      });
    } catch {
      // Never throw from the logger
    }
  }

  info(message: string, context?: LogContext) {
    this.emit('info', message, undefined, context);
  }

  warn(message: string, context?: LogContext) {
    this.emit('warn', message, undefined, context);
  }

  error(message: string, error?: unknown, context?: LogContext) {
    this.emit('error', message, error, context);
  }
}

export const logger = new Logger();
