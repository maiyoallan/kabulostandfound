import { Resend } from 'resend';
import { config } from '../config.js';
export async function sendMatchEmail(email,itemTitle) {
  if (!config.resendKey || !config.emailFrom) return;
  const resend = new Resend(config.resendKey);
  await resend.emails.send({from:config.emailFrom,to:email,subject:'A possible match on KABU Lost & Found',html:`<p>A newly found item may match <strong>${String(itemTitle).replace(/[<>&"']/g,'')}</strong>.</p><p>Sign in to KABU Lost &amp; Found to review the listing.</p>`});
}
