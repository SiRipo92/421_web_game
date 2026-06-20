"""G92 security audit: HTTP response security headers.

Adds standard hardening headers to every response. Cloudflare also sets
many of these at the edge in production — but defense-in-depth means
the origin sets them too so misconfigured edge rules don't silently
remove protection.

Headers explained:
  - **Strict-Transport-Security**: tell the browser to refuse HTTP for
    1 year, including subdomains. Prevents downgrade attacks on first
    request after the user types `421bistro.com` without scheme.
  - **X-Frame-Options: DENY**: prevent the site from being embedded in
    a frame/iframe by another site. Clickjacking defense.
  - **X-Content-Type-Options: nosniff**: stop browsers from guessing
    content types (a .jpg uploaded with HTML-looking payload won't
    execute as HTML).
  - **Referrer-Policy: strict-origin-when-cross-origin**: don't leak
    full URL paths to external sites in Referer headers.
  - **Permissions-Policy**: deny the browser features we don't use
    (camera, mic, geolocation, etc.) — third-party JS we add later
    can't accidentally request them.
  - **Content-Security-Policy**: strict-ish defaults. Allows the
    Google Fonts + Google SSO embed we currently use, blocks
    everything else. `'unsafe-inline'` is permitted for styles because
    React components use inline `style={{...}}` heavily — a follow-up
    G92b could enumerate every inline style + move them to a CSS file.

CSP additions to make in production when needed:
  - Sentry's report-uri endpoint (if/when we enable Sentry browser SDK)
  - The Brevo unsubscribe link domain (if we ever embed a Brevo widget)
  - The Cloudflare CDN if static assets move there
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.config import settings


def _build_csp(debug: bool) -> str:
    """Build the CSP directive string. Dev gets a slightly looser policy
    to allow Vite's dev server overlays + HMR websocket."""
    # Common allowlists.
    google_fonts = "https://fonts.gstatic.com https://fonts.googleapis.com"
    google_sso = "https://accounts.google.com https://*.gstatic.com"
    # In dev we let the SPA talk to the Vite HMR socket + dev-tools overlay.
    dev_relaxed = "ws: wss: http://localhost:* https://localhost:*" if debug else ""
    directives = [
        "default-src 'self'",
        # Allow inline styles (React's style={{...}}) + Google Fonts CSS.
        # `'unsafe-inline'` for styles is widely accepted; for scripts it's
        # avoided everywhere except where Vite injects HMR runtime.
        f"style-src 'self' 'unsafe-inline' {google_fonts}",
        f"font-src 'self' data: {google_fonts}",
        # Allow blob: URLs for any future avatar-upload preview.
        "img-src 'self' data: blob:",
        # Scripts: only `'self'` + Google SSO. Add `'unsafe-inline'` ONLY
        # in dev for Vite HMR overlay; never in prod.
        ("script-src 'self' " + ("'unsafe-inline' 'unsafe-eval' " if debug else "") + google_sso),
        # XHR / fetch / WebSocket connects.
        f"connect-src 'self' {google_sso} {dev_relaxed}".strip(),
        # Google SSO renders inside an iframe.
        f"frame-src {google_sso}",
        # Disallow embedding our site in a frame (matches X-Frame-Options: DENY).
        "frame-ancestors 'none'",
        # Forms can only post to ourselves (prevents malicious payload
        # exfiltration via a planted form).
        "form-action 'self'",
        # Disallow plugins (Flash, etc.).
        "object-src 'none'",
        # All `<base>` href values are relative to our origin.
        "base-uri 'self'",
        # In prod, force HTTPS upgrade for any accidentally-served HTTP
        # subresource.
        ("upgrade-insecure-requests" if not debug else ""),
    ]
    return "; ".join(d for d in directives if d)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Set hardening headers on every response.

    Idempotent: if Cloudflare also sets these at the edge in production,
    our value wins (or matches — same value, no conflict).
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._csp = _build_csp(settings.debug)

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # HSTS: 1 year, all subdomains, eligible for browser preload list.
        # Only sent on HTTPS responses to avoid confusing browsers when
        # someone runs dev over plain HTTP.
        if request.url.scheme == "https" or not settings.debug:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains; preload",
            )
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()",
        )
        response.headers.setdefault("Content-Security-Policy", self._csp)
        return response
