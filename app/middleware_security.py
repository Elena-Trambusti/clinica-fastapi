"""
Middleware per header HTTP di sicurezza (difesa in profondità).
Non sostituisce HTTPS in produzione: configurare TLS sul reverse proxy (es. Render).
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )
        # HSTS solo se esplicitamente richiesto (es. dietro HTTPS su Render)
        if os.getenv("ENABLE_HSTS", "").lower() in ("1", "true", "yes"):
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response
