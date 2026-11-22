
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  jwtSecret: process.env.JWT_SECRET,

  // Brevo email configuration
  brevoKey: process.env.BREVO_API_KEY,
  emailFrom: process.env.EMAIL_FROM,

  // Keep Resend temporarily as a fallback
 brevoKey: process.env.BREVO_API_KEY,

  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  }
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}
