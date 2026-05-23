"""Email delivery via Resend for transactional auth emails."""

import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)

_FROM = "421 Bistro <noreply@421bistro.fr>"


def _send(to: str, subject: str, html: str) -> None:
    """Synchronously dispatch a single email via the Resend API."""
    resend.api_key = settings.resend_api_key
    resend.Emails.send({"from": _FROM, "to": to, "subject": subject, "html": html})


async def send_reset_email(to_email: str, token: str, lang: str = "fr") -> None:
    """Send a bilingual password-reset email with a one-time link."""
    reset_url = f"{settings.app_url}/reset-password?token={token}"
    if lang == "en":
        subject = "Reset your 421 Bistro password"
        html = (
            f"<p>Click the link below to reset your password. "
            f"It expires in {settings.reset_token_expire_minutes} minutes.</p>"
            f"<p><a href='{reset_url}'>{reset_url}</a></p>"
            f"<p>If you did not request this, ignore this email.</p>"
        )
    else:
        subject = "Réinitialisation de votre mot de passe 421 Bistro"
        html = (
            f"<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe. "
            f"Ce lien expire dans {settings.reset_token_expire_minutes} minutes.</p>"
            f"<p><a href='{reset_url}'>{reset_url}</a></p>"
            f"<p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>"
        )
    try:
        _send(to_email, subject, html)
        logger.info("Reset email sent to %s", to_email)
    except Exception:
        logger.exception("Failed to send reset email to %s", to_email)
        raise
