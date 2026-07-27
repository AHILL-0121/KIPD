import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, message } = body;

    // Validate required fields
    if (!name || !email || !company) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // In a production environment, you would use a service like:
    // - SendGrid
    // - AWS SES
    // - Resend
    // - Nodemailer with SMTP
    
    // For now, we'll log to console and return success
    // TODO: Implement actual email sending
    console.log('📧 Contact Admin Request:');
    console.log('Name:', name);
    console.log('Email:', email);
    console.log('Company:', company);
    console.log('Message:', message || '(no message)');
    console.log('To: testsmtp20251@gmail.com');
    console.log('---');

    // Simulate email sending success
    // In production, replace this with actual email API call:
    /*
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Kipd Platform <noreply@kipd.app>',
        to: 'testsmtp20251@gmail.com',
        subject: `New Access Request from ${company}`,
        html: `
          <h2>New Kipd Access Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Company:</strong> ${company}</p>
          <p><strong>Message:</strong></p>
          <p>${message || 'No message provided'}</p>
          <hr/>
          <p>Reply to this email to continue the conversation with ${name}.</p>
        `
      })
    });
    */

    return NextResponse.json(
      { 
        success: true,
        message: 'Contact request received. Administrator will be in touch soon.'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error processing contact request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
