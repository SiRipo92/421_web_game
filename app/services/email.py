"""Transactional email delivery via Brevo + Jinja2 templates.

Architecture:
  - Jinja2 Environment loads templates from app/templates/emails/.
  - render_email(name, lang, **ctx) -> (subject, html, text) renders both
    HTML and plain-text bodies plus picks up the metadata subject line.
  - _send_via_brevo() POSTs to Brevo's transactional API.
  - High-level send_*() functions wrap render + send for each email type.

Unsubscribe tokens are signed JWTs (purpose='unsubscribe', no expiry —
users may unsub from an email any time after receipt). The handler
endpoint flips User.email_opt_in to False.
"""

import logging
from datetime import date
from email.utils import parseaddr
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from jose import jwt

from app.core.config import settings
from app.templates.emails.metadata import EMAIL_METADATA

logger = logging.getLogger(__name__)

_BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"
_UNSUB_PURPOSE = "unsubscribe"

# Autoescape HTML templates only — plain-text templates would have
# entities escaped (& → &amp;) otherwise, which renders wrong in mail
# clients that show the .txt part.
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(enabled_extensions=("html",), default=False),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _parse_sender() -> tuple[str, str]:
    """Split SENDER_EMAIL ('Name <addr@host>') into (name, email)."""
    name, addr = parseaddr(settings.sender_email)
    return name or "421 Bistro", addr


def make_unsubscribe_token(user_id: str) -> str:
    """Generate a signed token a user can hit to opt out of marketing.

    No expiry — a 2-year-old welcome email should still let the recipient
    unsubscribe. The token only flips email_opt_in=False, no other power.
    """
    return jwt.encode(
        {"sub": str(user_id), "purpose": _UNSUB_PURPOSE},
        settings.secret_key,
        algorithm="HS256",
    )


def verify_unsubscribe_token(token: str) -> str | None:
    """Return user_id if the token is valid + signed for unsubscribe, else None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.JWTError:
        return None
    if payload.get("purpose") != _UNSUB_PURPOSE:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


def render_email(
    template: str,
    lang: str,
    *,
    unsubscribe_token: str | None = None,
    subject_params: dict | None = None,
    **ctx,
) -> tuple[str, str, str]:
    """Render a template by name + language. Returns (subject, html, text).

    `unsubscribe_token`, when present, becomes an `unsubscribe_url` in
    the template context — only lifecycle templates render it in the
    footer; transactional templates ignore it (no opt-out).

    `subject_params` substitutes {placeholders} into the metadata subject
    line (used e.g. for admin_contact_form's "{category}" insert).
    """
    lang = lang if lang in ("fr", "en") else "fr"
    meta = EMAIL_METADATA[template][lang]
    subject = meta["subject"]
    if subject_params:
        subject = subject.format(**subject_params)

    base_ctx = {
        "lang": lang,
        "app_url": settings.app_url.rstrip("/"),
        "current_year": date.today().year,
        "title": meta.get("title", "421 Bistro"),
        "eyebrow": meta.get("eyebrow", "421 Bistro"),
        "unsubscribe_url": (
            f"{settings.app_url.rstrip('/')}/api/unsubscribe?token={unsubscribe_token}"
            if unsubscribe_token
            else None
        ),
        **ctx,
    }
    html = _env.get_template(f"{template}.{lang}.html").render(**base_ctx)
    text = _env.get_template(f"{template}.{lang}.txt").render(**base_ctx)
    return subject, html, text


def _send_via_brevo(
    *,
    to_email: str,
    to_name: str | None,
    subject: str,
    html: str,
    text: str,
    reply_to: str | None = None,
) -> None:
    """POST a single transactional email to Brevo. Raises on non-2xx."""
    if not settings.brevo_api_key:
        raise RuntimeError("BREVO_API_KEY is not configured")

    sender_name, sender_addr = _parse_sender()
    payload: dict = {
        "sender": {"name": sender_name, "email": sender_addr},
        "to": [{"email": to_email, **({"name": to_name} if to_name else {})}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    if reply_to:
        reply_name, reply_addr = parseaddr(reply_to)
        payload["replyTo"] = {"email": reply_addr, **({"name": reply_name} if reply_name else {})}

    headers = {
        "api-key": settings.brevo_api_key,
        "content-type": "application/json",
        "accept": "application/json",
    }
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(_BREVO_ENDPOINT, headers=headers, json=payload)
    if resp.status_code >= 300:
        # Brevo errors come back as JSON {code, message}; bubble both up
        # so the contact router can map them to the 502 code field.
        raise RuntimeError(f"Brevo {resp.status_code}: {resp.text[:200]}")


# -------------------- High-level send functions --------------------


async def send_reset_email(to_email: str, token: str, lang: str = "fr", username: str = "") -> None:
    """Send the bilingual password-reset email with a one-time link."""
    reset_url = f"{settings.app_url.rstrip('/')}/reset-password?token={token}"
    subject, html, text = render_email(
        "password_reset",
        lang,
        username=username or to_email.split("@")[0],
        reset_url=reset_url,
        expires_minutes=settings.reset_token_expire_minutes,
    )
    try:
        _send_via_brevo(
            to_email=to_email, to_name=username or None, subject=subject, html=html, text=text
        )
        logger.info("Password reset email sent to %s", to_email)
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
        raise


async def send_welcome_email(
    *, to_email: str, username: str, user_id: str, lang: str = "fr"
) -> None:
    """Send the post-signup welcome email. Gated by the caller on email_opt_in."""
    subject, html, text = render_email(
        "welcome",
        lang,
        username=username,
        unsubscribe_token=make_unsubscribe_token(user_id),
    )
    try:
        _send_via_brevo(to_email=to_email, to_name=username, subject=subject, html=html, text=text)
        logger.info("Welcome email sent to %s", to_email)
    except Exception:
        # Welcome email failure must not break signup — log and move on.
        logger.exception("Failed to send welcome email to %s", to_email)


async def send_admin_contact_form(
    *,
    name: str,
    from_email: str,
    category: str,
    category_label: str,
    message: str,
    lang: str = "fr",
) -> None:
    """Forward a contact-form submission to settings.contact_email."""
    subject, html, text = render_email(
        "admin_contact_form",
        lang,
        name=name,
        from_email=from_email,
        category_label=category_label,
        message=message,
        subject_params={"category": category_label},
    )
    _send_via_brevo(
        to_email=settings.contact_email,
        to_name=None,
        subject=subject,
        html=html,
        text=text,
        reply_to=f"{name} <{from_email}>",
    )
    logger.info("Contact form forwarded from %s (category=%s)", from_email, category)
