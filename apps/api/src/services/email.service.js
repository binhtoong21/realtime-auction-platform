import nodemailer from 'nodemailer';
import { createTransporter } from '../config/email.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@auction.dev';

const sendEmail = async ({ to, subject, html }) => {
  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Preview email: ${previewUrl}`);
  }

  return info;
};

const sendVerificationEmail = async (to, token) => {
  const verifyUrl = `${FRONTEND_URL}/auth/verify-email?token=${token}`;

  return sendEmail({
    to,
    subject: 'Xác thực tài khoản của bạn',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Chào mừng bạn đến với Auction Platform!</h2>
        <p>Vui lòng nhấn nút bên dưới để xác thực email của bạn:</p>
        <a href="${verifyUrl}" 
           style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: #fff; 
                  text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Xác thực Email
        </a>
        <p style="color: #6b7280; font-size: 14px;">
          Link này sẽ hết hạn sau 24 giờ. Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.
        </p>
      </div>
    `,
  });
};

const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${token}`;

  return sendEmail({
    to,
    subject: 'Đặt lại mật khẩu',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Yêu cầu đặt lại mật khẩu</h2>
        <p>Nhấn nút bên dưới để đặt lại mật khẩu của bạn:</p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 24px; background: #DC2626; color: #fff; 
                  text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Đặt lại mật khẩu
        </a>
        <p style="color: #6b7280; font-size: 14px;">
          Link này sẽ hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
        </p>
      </div>
    `,
  });
};

export { sendVerificationEmail, sendPasswordResetEmail };
