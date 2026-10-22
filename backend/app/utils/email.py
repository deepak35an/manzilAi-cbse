import smtplib
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings
from app.utils.logging import logger


def _send_otp_email_sync(recipient_email: str, otp: str, name: Optional[str] = None) -> bool:
    """Synchronous SMTP email dispatcher."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(
            "smtp_not_configured",
            recipient=recipient_email,
            msg="SMTP credentials not set in environment (SMTP_USER/SMTP_PASSWORD). OTP printed to console logs.",
        )
        print(
            f"📧 [Email Mock] Would send OTP {otp} to {recipient_email} (SMTP credentials omitted in env)"
        )
        return False

    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    display_name = name or "User"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Verification Code: {otp}"
    msg["From"] = f"Assessment Platform <{sender_email}>"
    msg["To"] = recipient_email

    text_body = f"Hello {display_name},\n\nYour verification code is: {otp}\n\nThis code will expire in {settings.OTP_EXPIRY_SECONDS // 60} minutes.\nIf you did not request this, please ignore this email."

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }}
        .card {{ max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }}
        .header {{ text-align: center; margin-bottom: 24px; }}
        .brand {{ color: #4f46e5; font-size: 20px; font-weight: 700; text-transform: uppercase; tracking: 1px; }}
        .title {{ color: #111827; font-size: 18px; font-weight: 600; margin-top: 8px; }}
        .otp-box {{ background: #f3f4f6; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; border: 1px dashed #cbd5e1; }}
        .otp-code {{ font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4f46e5; font-family: monospace; }}
        .footer {{ font-size: 12px; color: #6b7280; text-align: center; margin-top: 24px; line-height: 1.5; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">Online Assessment Platform</div>
          <div class="title">Verification Code</div>
        </div>
        <p style="color: #374151; font-size: 14px;">Hello <strong>{display_name}</strong>,</p>
        <p style="color: #4b5563; font-size: 14px; margin-bottom: 16px;">Use the code below to complete your login. This code is valid for <strong>{settings.OTP_EXPIRY_SECONDS // 60} minutes</strong>.</p>
        <div class="otp-box">
          <div class="otp-code">{otp}</div>
        </div>
        <p style="color: #6b7280; font-size: 13px;">If you did not initiate this login request, please ignore this email or contact support.</p>
        <div class="footer">
          &copy; Online Assessment Platform. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("otp_email_sent", recipient=recipient_email)
        print(f"📧 [Email Sent] Successfully delivered OTP email to {recipient_email}")
        return True
    except Exception as e:
        logger.error("otp_email_failed", recipient=recipient_email, error=str(e))
        print(f"⚠️ [Email Error] Failed to send OTP email to {recipient_email}: {e}")
        return False


async def send_otp_email(recipient_email: str, otp: str, name: Optional[str] = None) -> bool:
    """Async wrapper for dispatching OTP email in background thread."""
    return await asyncio.to_thread(_send_otp_email_sync, recipient_email, otp, name)


def _send_credentials_email_sync(recipient_email: str, name: str, username: str, password: str) -> bool:
    """Synchronous SMTP dispatcher for student login credentials."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(
            "smtp_not_configured",
            recipient=recipient_email,
            msg="SMTP credentials not set. Student credentials printed to console.",
        )
        print(f"📧 [Credentials Mock] Username: {username} | Password: {password} → {recipient_email}")
        return False

    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Student Login Credentials - Manzil AI"
    msg["From"] = f"Manzil AI <{sender_email}>"
    msg["To"] = recipient_email
    msg["Reply-To"] = sender_email

    text_body = (
        f"Hello {name},\n\n"
        f"Your student account has been created on Manzil AI.\n\n"
        f"Username: {username}\n"
        f"Password: {password}\n\n"
        f"Please log in at the portal and keep your credentials safe.\n"
        f"If you did not expect this, please contact your organization."
    )

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }}
        .card {{ max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; }}
        .brand {{ color: #4f46e5; font-size: 22px; font-weight: 700; text-transform: uppercase; text-align: center; margin-bottom: 8px; }}
        .title {{ color: #111827; font-size: 18px; font-weight: 600; text-align: center; margin-bottom: 24px; }}
        .cred-box {{ background: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; }}
        .cred-row {{ display: flex; justify-content: space-between; align-items: center; margin: 10px 0; }}
        .cred-label {{ color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; }}
        .cred-value {{ color: #0f172a; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 1px; }}
        .footer {{ font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px; line-height: 1.5; }}
        .warning {{ color: #d97706; font-size: 12px; text-align: center; margin-top: 12px; font-weight: 500; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">Manzil AI</div>
        <div class="title">Your Student Login Credentials</div>
        <p style="color: #334155; font-size: 14px;">Hello <strong>{name}</strong>,</p>
        <p style="color: #475569; font-size: 14px;">Your student account has been registered. Use the credentials below to sign in:</p>
        <div class="cred-box">
          <div class="cred-row">
            <span class="cred-label">Username</span>
            <span class="cred-value">{username}</span>
          </div>
          <div class="cred-row" style="border-top: 1px solid #f1f5f9; padding-top: 10px;">
            <span class="cred-label">Password</span>
            <span class="cred-value">{password}</span>
          </div>
        </div>
        <p class="warning">⚠️ Keep these credentials safe. You can also view or reset your password from your student profile.</p>
        <div class="footer">&copy; Manzil AI. All rights reserved.</div>
      </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("credentials_email_sent", recipient=recipient_email, username=username)
        print(f"📧 [Email Sent] Credentials successfully delivered to {recipient_email} (Username: {username})")
        return True
    except Exception as e:
        logger.error("credentials_email_failed", recipient=recipient_email, error=str(e))
        print(f"⚠️ [Email Error] Failed to send credentials to {recipient_email}: {e}")
        return False



async def send_credentials_email(recipient_email: str, name: str, username: str, password: str) -> bool:
    """Async wrapper for dispatching student credentials email in background thread."""
    return await asyncio.to_thread(_send_credentials_email_sync, recipient_email, name, username, password)

