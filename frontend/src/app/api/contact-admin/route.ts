import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { sendEmail } from '@/lib/email';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  company: z.string().trim().min(1).max(150),
  message: z.string().trim().max(2000).optional().default(''),
});

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Public "request access" form. Sends the request to CONTACT_ADMIN_EMAIL.
 * Before this, the message was only printed to the server log and then discarded while the visitor was told it was sent.
 * TODO: rate limit this route (checklist section 1). It is public.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, email, company, message } = await parseJson(request, schema);

    const to = process.env.CONTACT_ADMIN_EMAIL;
    if (!to) throw new HttpError(503, 'Access requests are not set up yet. Please try again later.');

    const sent = await sendEmail({
      to,
      subject: `New Kipd access request from ${company.slice(0, 80)}`,
      html: `<h2>New Kipd access request</h2>
        <p><strong>Name:</strong> ${esc(name)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        <p><strong>Company:</strong> ${esc(company)}</p>
        <p><strong>Message:</strong></p><p>${esc(message || 'No message provided').replace(/\n/g, '<br>')}</p>`,
    });
    if (!sent.success) throw new HttpError(502, 'We could not send your request. Please try again.');

    return NextResponse.json({ success: true, message: 'Request received. We will be in touch soon.' });
  } catch (error) {
    return handleError(error, 'Failed to process request');
  }
}
