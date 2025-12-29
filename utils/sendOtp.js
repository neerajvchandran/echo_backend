const sgMail = require('@sendgrid/mail');

if (!process.env.SENDGRID_API_KEY) {
  console.warn('⚠ SENDGRID_API_KEY not set — OTP emails will NOT send.');
}
if (!process.env.FROM_EMAIL) {
  console.warn('⚠ FROM_EMAIL not set — SendGrid requires a verified sender.');
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY || 'dummy-key');

async function sendOtp(to, otp, purpose = 'Your OTP') {
  const msg = {
    to,
    from: process.env.FROM_EMAIL || 'no-reply@example.com',
    subject: purpose,
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
  };

  try {
    await sgMail.send(msg);
    console.log(`📧 OTP sent to ${to}`);
    return true;
  } catch (err) {
    console.error('❌ Error sending OTP:', err?.response?.body || err);
    return false;
  }
}

module.exports = sendOtp;
