"""Contact form endpoint — sends email via Resend to the configured CONTACT_EMAIL."""

import logging

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.limiter import limiter
from app.services.email import _FROM

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["contact"])


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str


@router.post("/contact", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/hour")
async def contact(request: Request, body: ContactRequest):
    """Forward a contact form submission to the site owner via Resend."""
    if not settings.contact_email:
        # Silently accept when not yet configured — prevents leaking setup status
        logger.info("Contact form submission ignored (CONTACT_EMAIL not set): %s", body.email)
        return {"detail": "Message received"}

    import resend

    resend.api_key = settings.resend_api_key
    if not settings.resend_api_key:
        logger.warning("Contact form: RESEND_API_KEY not set, email not sent")
        return {"detail": "Message received"}

    subject_map = {
        "export": "[421 Bistro] Demande d'export de données",
        "delete": "[421 Bistro] Demande de suppression de compte",
        "bug": "[421 Bistro] Signalement de bug",
        "other": "[421 Bistro] Message de contact",
    }
    email_subject = subject_map.get(body.subject, f"[421 Bistro] {body.subject}")
    html = (
        f"<p><strong>De :</strong> {body.name} &lt;{body.email}&gt;</p>"
        f"<p><strong>Sujet :</strong> {body.subject}</p>"
        f"<hr/>"
        f"<p>{body.message.replace(chr(10), '<br/>')}</p>"
    )
    try:
        resend.Emails.send(
            {
                "from": _FROM,
                "to": settings.contact_email,
                "reply_to": f"{body.name} <{body.email}>",
                "subject": email_subject,
                "html": html,
            }
        )
        logger.info("Contact email sent from %s (subject: %s)", body.email, body.subject)
    except Exception:
        logger.exception("Failed to send contact email from %s", body.email)
        raise HTTPException(status_code=502, detail="Failed to send message")
    return {"detail": "Message received"}
