const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendOtp(to, otp, purpose = "Your OTP") {
  const msg = {
    to,
    from: process.env.FROM_EMAIL,
    subject: purpose,
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
  };

  try {
    await sgMail.send(msg);
    console.log(`OTP sent to ${to}`);
  } catch (err) {
    console.error("Error sending OTP:", err);
  }
}

module.exports = sendOtp;
