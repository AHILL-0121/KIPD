import nodemailer from 'nodemailer';

/** Escape user-supplied text before it goes into an HTML email. */
const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail({ to, subject, html, attachments }: EmailOptions) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Kipd Platform" <no-reply@kipd.com>',
      to,
      subject,
      html,
      attachments,
    });

    return { success: true, id: info.messageId };
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send email:', error);
    return { success: false, error };
  }
}

// Email templates
export const emailTemplates = {
  bookingConfirmation: (data: {
    guestName: string;
    hotelName: string;
    checkIn: string;
    checkOut: string;
    roomType: string;
    bookingId: string;
  }) => `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #0B6B6F; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #1C1917; font-size: 24px; margin-bottom: 20px;">Booking Confirmed!</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Dear ${esc(data.guestName)},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        Your reservation at <strong>${esc(data.hotelName)}</strong> has been confirmed.
      </p>
      
      <div style="background: #FAF8F4; border-radius: 12px; padding: 24px; margin: 30px 0;">
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Booking ID:</strong>
          <span style="color: #6B6662;"> ${esc(data.bookingId)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Room Type:</strong>
          <span style="color: #6B6662;"> ${esc(data.roomType)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Check-in:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkIn)}</span>
        </div>
        <div>
          <strong style="color: #1C1917;">Check-out:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkOut)}</span>
        </div>
      </div>
      
      <p style="color: #6B6662; line-height: 1.6;">
        We look forward to welcoming you!
      </p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E7E5E4; text-align: center; color: #A8A29E; font-size: 12px;">
        <p>Powered by Kipd — Hotel & Restaurant Management</p>
      </div>
    </div>
  `,

  bookingRequestReceived: (data: {
    guestName: string;
    hotelName: string;
    checkIn: string;
    checkOut: string;
    roomType: string;
    bookingId: string;
    totalAmount?: string;
  }) => `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #0B6B6F; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #1C1917; font-size: 24px; margin-bottom: 20px;">Booking Request Received</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Dear ${esc(data.guestName)},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        Thank you for choosing <strong>${esc(data.hotelName)}</strong>. We have received your booking request and our front desk will review and confirm your reservation shortly.
      </p>
      
      <div style="background: #FAF8F4; border-radius: 12px; padding: 24px; margin: 30px 0;">
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Status:</strong>
          <span style="color: #D97706; font-weight: 600;"> Pending Confirmation</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Booking Reference:</strong>
          <span style="color: #6B6662;"> ${esc(data.bookingId)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Room Type:</strong>
          <span style="color: #6B6662;"> ${esc(data.roomType)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Check-in:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkIn)}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Check-out:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkOut)}</span>
        </div>
        ${data.totalAmount ? `
        <div>
          <strong style="color: #1C1917;">Estimated Total:</strong>
          <span style="color: #1C1917; font-weight: 600;"> ₹${esc(data.totalAmount)}</span>
        </div>` : ''}
      </div>
      
      <p style="color: #6B6662; line-height: 1.6;">
        You will receive another email as soon as your booking is confirmed.
      </p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E7E5E4; text-align: center; color: #A8A29E; font-size: 12px;">
        <p>Powered by Kipd — Hotel & Restaurant Management</p>
      </div>
    </div>
  `,

  bookingCancellation: (data: {
    guestName: string;
    hotelName: string;
    checkIn: string;
    checkOut: string;
    bookingId: string;
  }) => `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #0B6B6F; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #B91C1C; font-size: 24px; margin-bottom: 20px;">Booking Cancelled</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Dear ${esc(data.guestName)},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        Your reservation at <strong>${esc(data.hotelName)}</strong> (Booking Reference: <strong>${esc(data.bookingId)}</strong>) has been cancelled.
      </p>
      
      <div style="background: #FAF8F4; border-radius: 12px; padding: 24px; margin: 30px 0;">
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Check-in:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkIn)}</span>
        </div>
        <div>
          <strong style="color: #1C1917;">Check-out:</strong>
          <span style="color: #6B6662;"> ${esc(data.checkOut)}</span>
        </div>
      </div>
      
      <p style="color: #6B6662; line-height: 1.6;">
        If this was unexpected or if you have questions regarding refunds or deposits, please contact the hotel directly.
      </p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E7E5E4; text-align: center; color: #A8A29E; font-size: 12px;">
        <p>Powered by Kipd — Hotel & Restaurant Management</p>
      </div>
    </div>
  `,

  invoiceReceipt: (data: {
    guestName: string;
    propertyName: string;
    title: string;
    referenceNumber: string;
    issuedDate: string;
    lines: { name: string; qty: number; rate: number; amount: number }[];
    subtotal?: number;
    taxTotal?: number;
    credited?: number;
    total: number;
    paid: number;
    balance: number;
    hasAttachment?: boolean;
    footer?: string;
  }) => `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px; color: #1C1917;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="color: #0B6B6F; font-family: Georgia, serif; font-size: 28px; margin: 0;">${esc(data.propertyName)}</h1>
        <p style="color: #78716C; font-size: 13px; margin-top: 4px;">${esc(data.title)} · ${esc(data.referenceNumber)}</p>
      </div>

      <p style="color: #44403C; line-height: 1.6;">Dear ${esc(data.guestName)},</p>
      <p style="color: #44403C; line-height: 1.6;">
        Thank you for visiting <strong>${esc(data.propertyName)}</strong>. Here is your ${esc(data.title.toLowerCase())} dated ${esc(data.issuedDate)}${data.hasAttachment ? ' (PDF attached).' : '.'}
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 2px solid #E7E5E4; text-align: left; color: #78716C;">
            <th style="padding: 8px 4px;">Description</th>
            <th style="padding: 8px 4px; text-align: right;">Qty</th>
            <th style="padding: 8px 4px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.lines
            .map(
              (l) => `
          <tr style="border-bottom: 1px solid #F5F5F4;">
            <td style="padding: 8px 4px;">${esc(l.name)}</td>
            <td style="padding: 8px 4px; text-align: right;">${esc(l.qty)}</td>
            <td style="padding: 8px 4px; text-align: right; white-space: nowrap;">₹${esc(l.amount.toFixed(2))}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>

      <div style="background: #FAF8F4; border-radius: 12px; padding: 16px 20px; font-size: 14px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${data.subtotal !== undefined ? `<tr><td style="padding: 4px 0; color: #78716C;">Subtotal</td><td style="padding: 4px 0; text-align: right; white-space: nowrap;">₹${esc(data.subtotal.toFixed(2))}</td></tr>` : ''}
          ${data.taxTotal && data.taxTotal > 0 ? `<tr><td style="padding: 4px 0; color: #78716C;">Taxes (GST)</td><td style="padding: 4px 0; text-align: right; white-space: nowrap;">₹${esc(data.taxTotal.toFixed(2))}</td></tr>` : ''}
          <tr>
            <td style="padding: 10px 0 6px; font-weight: 700; font-size: 16px; border-top: 1px solid #E7E5E4;">Total</td>
            <td style="padding: 10px 0 6px; font-weight: 700; font-size: 16px; text-align: right; border-top: 1px solid #E7E5E4; white-space: nowrap;">₹${esc(data.total.toFixed(2))}</td>
          </tr>
          ${data.credited && data.credited > 0 ? `<tr><td style="padding: 4px 0; color: #78716C;">Credit notes</td><td style="padding: 4px 0; text-align: right; white-space: nowrap;">- ₹${esc(data.credited.toFixed(2))}</td></tr>` : ''}
          <tr>
            <td style="padding: 4px 0; color: #047857;">Paid</td>
            <td style="padding: 4px 0; text-align: right; color: #047857; white-space: nowrap;">₹${esc(data.paid.toFixed(2))}</td>
          </tr>
          ${data.balance > 0 ? `<tr><td style="padding: 4px 0; color: #B91C1C; font-weight: 600;">Balance due</td><td style="padding: 4px 0; text-align: right; color: #B91C1C; font-weight: 600; white-space: nowrap;">₹${esc(data.balance.toFixed(2))}</td></tr>` : ''}
        </table>
      </div>

      ${data.footer ? `<p style="color: #78716C; font-size: 13px; text-align: center; margin-top: 24px;">${esc(data.footer)}</p>` : ''}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E7E5E4; text-align: center; color: #A8A29E; font-size: 12px;">
        <p>Powered by Kipd — Hotel & Restaurant Management</p>
      </div>
    </div>
  `,

  staffInvite: (data: {
    name: string;
    hotelName: string;
    role: string;
    inviteUrl: string;
  }) => `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #0B6B6F; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #1C1917; font-size: 24px; margin-bottom: 20px;">You've been invited!</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Hi ${esc(data.name)},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        You've been invited to join <strong>${esc(data.hotelName)}</strong> as a <strong>${esc(data.role)}</strong>.
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${esc(data.inviteUrl)}" style="display: inline-block; background: #0B6B6F; color: #1C1917; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 500;">
          Accept Invitation
        </a>
      </div>
      
      <p style="color: #A8A29E; font-size: 12px; line-height: 1.6;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E7E5E4; text-align: center; color: #A8A29E; font-size: 12px;">
        <p>Powered by Kipd — Hotel & Restaurant Management</p>
      </div>
    </div>
  `,
};
