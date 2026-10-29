import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

/** An error that maps directly to an HTTP status. Safe to show the message to the client. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public headers?: Record<string, string>) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'Unauthorized');
export const forbidden = () => new HttpError(403, 'You do not have permission to do this');
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const badRequest = (message: string) => new HttpError(400, message);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres throws on malformed UUIDs (a 500). Treat them as "not found" instead. */
export function assertUuid(id: unknown, what = 'Resource'): string {
  if (typeof id !== 'string' || !UUID.test(id)) throw notFound(what);
  return id;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return schema.parse(body);
}

/** Convert any thrown value into a safe JSON response. Never leaks internals. */
export function handleError(error: unknown, fallback: string) {
  // Next.js uses a thrown error to mark a route as dynamic. It must not be swallowed.
  if ((error as { digest?: string } | null)?.digest === 'DYNAMIC_SERVER_USAGE') throw error;
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: error.headers });
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const where = issue?.path.join('.') || 'request';
    return NextResponse.json({ error: `${where}: ${issue?.message ?? 'invalid value'}` }, { status: 400 });
  }
  const e = error as { code?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  if (code === '23503') {
    return NextResponse.json({ error: 'This item is still in use by other records and cannot be removed.' }, { status: 409 });
  }
  if (code === '23P01') {
    // exclusion_violation: the database refused an overlapping booking (two people raced for the same room)
    return NextResponse.json({ error: 'That room was just booked for those dates. Please choose different dates or another room.' }, { status: 409 });
  }
  if (code === '23505') {
    return NextResponse.json({ error: 'An item with these details already exists.' }, { status: 409 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
