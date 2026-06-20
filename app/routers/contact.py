"""Contact form + policy config + unsubscribe endpoint.

Contact-form submissions are forwarded to CONTACT_EMAIL via Brevo. The
unsubscribe handler flips email_opt_in to False for the user encoded in
the signed token.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limiter import limiter
from app.db.base import get_db
from app.db.models import User
from app.services.email import send_admin_contact_form, verify_unsubscribe_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["contact"])

# Category code → bilingual labels (used in the admin email + the
# Brevo subject line so the inbox shows what kind of message it is).
_CATEGORY_LABELS = {
    "export": {"fr": "Demande d'export de données", "en": "Data export request"},
    "delete": {"fr": "Demande de suppression de compte", "en": "Account deletion request"},
    "bug": {"fr": "Signalement de bug", "en": "Bug report"},
    "appeal": {"fr": "Contestation de modération", "en": "Moderation appeal"},
    "other": {"fr": "Message de contact", "en": "Contact message"},
}


@router.get("/policy-config")
async def policy_config():
    """G68 follow-up: surface the env-driven legal/policy values so the
    Privacy and Terms pages can render the current numbers (inactivity
    window, deletion grace, breach notification window, audit log
    retention). Public — no auth required."""
    return {
        "inactive_account_warning_years": settings.inactive_account_warning_years,
        "inactive_account_deletion_days": settings.inactive_account_deletion_days,
        "breach_notification_hours": settings.breach_notification_hours,
        "moderation_log_retention_days": settings.moderation_log_retention_days,
    }


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str


@router.post("/contact", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/hour")
async def contact(request: Request, body: ContactRequest):
    """Forward a contact form submission to CONTACT_EMAIL via Brevo."""
    if not settings.contact_email:
        # Silently accept when not yet configured — prevents leaking setup status.
        logger.info("Contact form submission ignored (CONTACT_EMAIL not set): %s", body.email)
        return {"detail": "Message received"}

    if not settings.brevo_api_key:
        logger.warning("Contact form: BREVO_API_KEY not set, email not sent")
        return {"detail": "Message received"}

    # Site owner's lang — French unless someone reads English better.
    # Hardcoded for now; if the admin ever changes, this becomes a setting.
    admin_lang = "fr"
    category_label = _CATEGORY_LABELS.get(body.subject, _CATEGORY_LABELS["other"])[admin_lang]

    try:
        await send_admin_contact_form(
            name=body.name,
            from_email=body.email,
            category=body.subject,
            category_label=category_label,
            message=body.message,
            lang=admin_lang,
        )
    except Exception as exc:
        # G68 follow-up: differentiate sender-domain issues (Brevo rejects
        # unverified domains during dev) from genuine outages so the
        # frontend can render a useful message instead of generic
        # "An error occurred".
        logger.exception("Failed to send contact email from %s", body.email)
        msg = str(exc).lower()
        if "sender" in msg or "from" in msg or "domain" in msg or "not verified" in msg:
            code = "email_sender_not_configured"
        else:
            code = "email_service_unavailable"
        raise HTTPException(
            status_code=502,
            detail={"code": code, "message": "Failed to send message"},
        ) from exc
    return {"detail": "Message received"}


@router.get("/unsubscribe")
async def unsubscribe(token: str, db: AsyncSession = Depends(get_db)):
    """One-click unsubscribe from lifecycle emails.

    Flips email_opt_in=False for the user encoded in the signed token,
    then redirects to the static confirmation page on the SPA. Idempotent
    — re-clicking the link after unsubscribing is fine.
    """
    user_id = verify_unsubscribe_token(token)
    if not user_id:
        # Bad/forged token — redirect to the page with an error flag so
        # the SPA can show "this link is invalid" rather than 4xx-ing
        # the browser (RGPD-friendlier: the recipient gets a useful page).
        return RedirectResponse(
            url=f"{settings.app_url.rstrip('/')}/unsubscribed?status=invalid",
            status_code=302,
        )

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return RedirectResponse(
            url=f"{settings.app_url.rstrip('/')}/unsubscribed?status=invalid",
            status_code=302,
        )

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        # User deleted since the token was issued — treat as already-unsub.
        return RedirectResponse(
            url=f"{settings.app_url.rstrip('/')}/unsubscribed?status=ok",
            status_code=302,
        )

    if user.email_opt_in:
        user.email_opt_in = False
        await db.commit()
        logger.info("User %s unsubscribed via token", user.id)

    return RedirectResponse(
        url=f"{settings.app_url.rstrip('/')}/unsubscribed?status=ok",
        status_code=302,
    )
