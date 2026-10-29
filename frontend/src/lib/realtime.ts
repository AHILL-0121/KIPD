/**
 * In-process pub/sub for the live order screens (KDS, orders, billing).
 *
 * KNOWN LIMIT: clients live in this process's memory. On a single long-running
 * server this works. On serverless (Vercel) an event published on one instance
 * will not reach a client connected to another. Replace with a managed pub/sub
 * (checklist section 9) before relying on it in production.
 */
type Client = { controller: ReadableStreamDefaultController; channel: string };

const g = globalThis as unknown as { __kipdSse?: Map<string, Client> };
const clients: Map<string, Client> = (g.__kipdSse ??= new Map());

const encoder = new TextEncoder();

export function registerClient(channel: string, controller: ReadableStreamDefaultController): string {
  const id = crypto.randomUUID();
  clients.set(id, { controller, channel });
  return id;
}

export function unregisterClient(id: string) {
  clients.delete(id);
}

export function send(controller: ReadableStreamDefaultController, payload: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export function heartbeat(controller: ReadableStreamDefaultController) {
  controller.enqueue(encoder.encode(`: keep-alive\n\n`));
}

/** Deliver to every client subscribed to exactly this channel. */
export function broadcastOrderUpdate(channel: string, payload: unknown) {
  const data = encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const [id, client] of clients) {
    if (client.channel !== channel) continue;
    try {
      client.controller.enqueue(data);
    } catch {
      clients.delete(id); // stream already closed
    }
  }
}
