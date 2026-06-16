"""Per-template per-language subject lines + display titles.

Kept separate from the Jinja templates so subjects don't need their own
file each. `render_email()` in `app/services/email.py` looks templates
up here.
"""

EMAIL_METADATA: dict[str, dict[str, dict[str, str]]] = {
    "password_reset": {
        "fr": {
            "subject": "Réinitialisation de votre mot de passe 421 Bistro",
            "title": "Réinitialiser votre mot de passe",
            "eyebrow": "Sécurité du compte",
        },
        "en": {
            "subject": "Reset your 421 Bistro password",
            "title": "Reset your password",
            "eyebrow": "Account security",
        },
    },
    "welcome": {
        "fr": {
            "subject": "Bienvenue au 421 Bistro",
            "title": "Bienvenue à table",
            "eyebrow": "Nouveau joueur",
        },
        "en": {
            "subject": "Welcome to 421 Bistro",
            "title": "Welcome to the table",
            "eyebrow": "New player",
        },
    },
    "admin_contact_form": {
        # Admin-only email — sent to CONTACT_EMAIL. Language matches the
        # site owner's lang_pref, not the sender's. Always French for now
        # since the site owner is francophone.
        "fr": {
            "subject": "[421 Bistro] Nouveau message — {category}",
            "title": "Nouveau message",
            "eyebrow": "Formulaire de contact",
        },
        "en": {
            "subject": "[421 Bistro] New message — {category}",
            "title": "New message",
            "eyebrow": "Contact form",
        },
    },
    # ---- Stubs (HTML + subject only, not yet wired to a sender) ----
    "ban_notice": {
        "fr": {
            "subject": "Suspension de compte 421 Bistro",
            "title": "Suspension de compte",
            "eyebrow": "Modération",
        },
        "en": {
            "subject": "421 Bistro account suspension",
            "title": "Account suspension",
            "eyebrow": "Moderation",
        },
    },
    "account_deletion_warning": {
        "fr": {
            "subject": "Votre compte 421 Bistro va être supprimé",
            "title": "Compte inactif",
            "eyebrow": "RGPD — données dormantes",
        },
        "en": {
            "subject": "Your 421 Bistro account is scheduled for deletion",
            "title": "Inactive account",
            "eyebrow": "GDPR — data minimisation",
        },
    },
    "breach_notification": {
        "fr": {
            "subject": "Incident de sécurité — 421 Bistro",
            "title": "Incident de sécurité",
            "eyebrow": "RGPD — Art. 34",
        },
        "en": {
            "subject": "Security incident — 421 Bistro",
            "title": "Security incident",
            "eyebrow": "GDPR — Art. 34",
        },
    },
}
