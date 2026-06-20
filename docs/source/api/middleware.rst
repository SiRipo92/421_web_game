app.middleware
==============

ASGI middleware. Currently just :class:`SecurityHeadersMiddleware`,
which sets HSTS / CSP / X-Frame-Options / nosniff / Referrer-Policy /
Permissions-Policy on every response (G92).

.. automodule:: app.middleware.security_headers
   :members:
