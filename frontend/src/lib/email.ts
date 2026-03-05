import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    const result = await resend.emails.send({
      from: 'Kipd <noreply@kipd.app>',
      to,
      subject,
      html,
    });
    
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error('Failed to send email:', error);
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
        <h1 style="color: #E8A020; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #1C1917; font-size: 24px; margin-bottom: 20px;">Booking Confirmed!</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Dear ${data.guestName},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        Your reservation at <strong>${data.hotelName}</strong> has been confirmed.
      </p>
      
      <div style="background: #FAF8F4; border-radius: 12px; padding: 24px; margin: 30px 0;">
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Booking ID:</strong>
          <span style="color: #6B6662;"> ${data.bookingId}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Room Type:</strong>
          <span style="color: #6B6662;"> ${data.roomType}</span>
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #1C1917;">Check-in:</strong>
          <span style="color: #6B6662;"> ${data.checkIn}</span>
        </div>
        <div>
          <strong style="color: #1C1917;">Check-out:</strong>
          <span style="color: #6B6662;"> ${data.checkOut}</span>
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
  
  staffInvite: (data: {
    name: string;
    hotelName: string;
    role: string;
    inviteUrl: string;
  }) => `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #E8A020; font-family: 'Playfair Display', serif; font-size: 32px; margin: 0;">Kipd</h1>
      </div>
      
      <h2 style="color: #1C1917; font-size: 24px; margin-bottom: 20px;">You've been invited!</h2>
      
      <p style="color: #6B6662; line-height: 1.6;">Hi ${data.name},</p>
      
      <p style="color: #6B6662; line-height: 1.6;">
        You've been invited to join <strong>${data.hotelName}</strong> as a <strong>${data.role}</strong>.
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${data.inviteUrl}" style="display: inline-block; background: #E8A020; color: #1C1917; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 500;">
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
