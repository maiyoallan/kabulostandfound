
import { BrevoClient } from '@getbrevo/brevo';
import { config } from '../config.js';

export async function sendOtp(email, code, purpose = 'verification') {
  if (!config.brevoKey || !config.emailFrom) {
    throw new Error(
      'Email delivery is not configured. Check BREVO_API_KEY and EMAIL_FROM.'
    );
  }

  const match = config.emailFrom.match(/^(.*?)\s*<([^>]+)>$/);

  const sender = match
    ? { name: match[1].trim(), email: match[2].trim() }
    : { name: 'KABU FINDER', email: config.emailFrom.trim() };

  const isPasswordReset = purpose === 'password-reset';

  const subject = isPasswordReset
    ? 'Reset your KABU Lost & Found password'
    : 'Your KABU Lost & Found verification code';

  const heading = isPasswordReset
    ? 'Password reset'
    : 'Email verification';

  const instruction = isPasswordReset
    ? 'Use this code to reset your password:'
    : 'Your email verification code is:';

  const brevo = new BrevoClient({ apiKey: config.brevoKey });

  try {
    const result = await brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email }],
      subject,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;padding:24px;">
          <h2>KABU Lost & Found</h2>
          <h3>${heading}</h3>
          <p>${instruction}</p>
          <h1 style="letter-spacing:8px;">${code}</h1>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    });

    console.log('Email accepted by Brevo:', result.messageId);
    return result;
  } catch (error) {
    console.error(
      'BREVO EMAIL ERROR:',
      error.statusCode || '',
      error.message || 'Email delivery failed'
    );
    throw new Error('Could not send email');
  }
}
