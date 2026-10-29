import { NextRequest } from 'next/server';
import { requireTenant } from '@/lib/auth';
import { HttpError, forbidden, handleError } from '@/lib/http';
import { heartbeat, registerClient, send, unregisterClient } from '@/lib/realtime';
import { ownedOutlet } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Live order stream. The channel in the URL is either this tenant's id or one of
 * its outlet ids. Anything else is refused, so one tenant can never listen to
 * another tenant's kitchen.
 */
export async function GET(request: NextRequest, { params }: { params: { outletId: string } }) {
  let channel: string;
  try {
    const { tenantId } = await requireTenant();
    channel = params.outletId;
    if (channel !== tenantId) {
      try {
        await ownedOutlet(tenantId, channel);
      } catch (e) {
        throw e instanceof HttpError && e.status === 404 ? forbidden() : e;
      }
    }
  } catch (error) {
    return handleError(error, 'Failed to open the live stream');
  }

  let clientId = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (timer) clearInterval(timer);
    if (clientId) unregisterClient(clientId);
  };

  const stream = new ReadableStream({
    start(controller) {
      clientId = registerClient(channel, controller);
      send(controller, { type: 'connected', channel });
      // Proxies and mobile networks close idle streams; a comment line every 25 s keeps it open.
      timer = setInterval(() => {
        try { heartbeat(controller); } catch { cleanup(); }
      }, 25_000);
      request.signal.addEventListener('abort', cleanup);
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
