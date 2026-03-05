import { NextRequest } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

let clients: Map<string, ReadableStreamDefaultController> = new Map();

export async function GET(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  const { outletId } = params;

  const stream = new ReadableStream({
    start(controller) {
      // Store client connection
      const clientId = Math.random().toString(36);
      clients.set(clientId, controller);

      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      );

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        clients.delete(clientId);
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

// Helper function to broadcast updates (called from order creation)
export function broadcastOrderUpdate(outletId: string, order: any) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`data: ${JSON.stringify(order)}\n\n`);
  
  clients.forEach((controller) => {
    try {
      controller.enqueue(data);
    } catch (error) {
      console.error('Failed to send SSE update:', error);
    }
  });
}
