from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import deque

from fastapi import Request

# scrypt: memory-hard, in the standard library. ~16 MB and a few tens of ms per check.
_N, _R, _P = 2**14, 8, 1

PUBLIC_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"  # no 0/o, 1/l/i: easy to read aloud
PUBLIC_ID_LENGTH = 8


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, expected = stored.split("$")
        if algo != "scrypt":
            return False
        want = _b64d(expected)
        got = hashlib.scrypt(
            password.encode(), salt=_b64d(salt), n=int(n), r=int(r), p=int(p), dklen=len(want)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got, want)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    """Sessions are stored hashed, so a copy of the database can't be used to sign in."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_public_id() -> str:
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(PUBLIC_ID_LENGTH))


def client_ip(request: Request) -> str:
    # Cloudflare sets CF-Connecting-IP (and overwrites any a visitor sends); nginx sets X-Real-IP.
    for header in ("cf-connecting-ip", "x-real-ip"):
        value = request.headers.get(header, "").strip()
        if value:
            return value
    return request.client.host if request.client else "unknown"


class LoginLimiter:
    """Counts failed sign-ins per address, and in total.

    An address is blocked after `per_ip` failures in the window. When failures across all addresses
    reach `overall` (guessing spread over many addresses), each address gets only `under_attack`
    failures instead. An address with no recent failures can always try, so a flood of wrong
    guesses can't lock the admins out.

    Tries still being checked count against an address's allowance too, so a burst of guesses sent
    all at once can't slip past it before the first of them has failed.
    """

    def __init__(
        self, per_ip: int = 10, overall: int = 100, under_attack: int = 1, window_s: float = 15 * 60
    ) -> None:
        self.per_ip, self.overall, self.under_attack, self.window = per_ip, overall, under_attack, window_s
        self._by_ip: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()
        self._checking: dict[str, int] = {}  # tries begun and not yet ended, per address
        self._lock = threading.Lock()

    def _trim(self, q: deque[float], now: float) -> None:
        while q and q[0] <= now - self.window:
            q.popleft()

    def begin(self, ip: str) -> bool:
        """Whether the address may try a password now. Every True must be followed by end()."""
        now = time.monotonic()
        with self._lock:
            self._trim(self._all, now)
            q = self._by_ip.get(ip)
            if q is not None:
                self._trim(q, now)
                if not q:
                    del self._by_ip[ip]
                    q = None
            used = (len(q) if q else 0) + self._checking.get(ip, 0)
            limit = self.under_attack if len(self._all) >= self.overall else self.per_ip
            if used >= limit:
                return False
            self._checking[ip] = self._checking.get(ip, 0) + 1
            return True

    def end(self, ip: str, *, failed: bool, forget: bool = False) -> None:
        """Ends a try that begin() allowed, counting it if it failed. forget clears the address's failures:
        only for root sign-ins, since if the link password cleared them, someone who knows it could keep
        resetting their count while guessing root."""
        now = time.monotonic()
        with self._lock:
            left = self._checking.get(ip, 0) - 1
            if left > 0:
                self._checking[ip] = left
            else:
                self._checking.pop(ip, None)
            if forget:
                self._by_ip.pop(ip, None)
            elif failed:
                self._all.append(now)
                self._by_ip.setdefault(ip, deque()).append(now)
                if len(self._by_ip) > 5000:  # forget addresses whose failures have aged out
                    for key in [k for k, q in self._by_ip.items() if not q or q[-1] <= now - self.window]:
                        del self._by_ip[key]
