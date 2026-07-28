import { NextRequest } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Switch to Node.js runtime instead of Edge to permit cross-API memory mapping via global objects!
export const dynamic = 'force-dynamic';

const globalAny: any = global;
if (!globalAny.sseClients) {
  globalAny.sseClients = new Map<string, { controller: ReadableStreamDefaultController, channel: string }>();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  const { outletId } = params;

  const stream = new ReadableStream({
    start(controller) {
      // Store client connection in the Global Socket Map, binding it to the requested channel
      const clientId = Math.random().toString(36);
      globalAny.sseClients.set(clientId, { controller, channel: outletId });

      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', channel: outletId })}\n\n`)
      );

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        globalAny.sseClients.delete(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper function to broadcast updates securely to specific channels
export function broadcastOrderUpdate(targetChannel: string, order: any) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`data: ${JSON.stringify(order)}\n\n`);

  if (!globalAny.sseClients) return;

  globalAny.sseClients.forEach((client: { controller: ReadableStreamDefaultController, channel: string }) => {
    // Strict Multi-Tenant Isolator: ONLY broadcast if strictly in the target channel 
    if (client.channel === targetChannel) {
      try {
        client.controller.enqueue(data);
      } catch (error) {
        console.error('Failed to send SSE update:', error);
      }
    }
  });
}
