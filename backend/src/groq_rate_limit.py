"""Groq API 429 handling using response headers (see https://console.groq.com/docs/rate-limits)."""

from __future__ import annotations

import email.utils
import re
import time
from datetime import datetime, timezone

import httpx

try:
    from groq import RateLimitError as _GroqRateLimitError
except ImportError:  # pragma: no cover
    _GroqRateLimitError = None


class GroqDailyQuotaExceeded(RuntimeError):
    """Raised when Groq indicates the daily request budget (RPD) is exhausted."""


# No trailing \\b: Groq uses compact tokens like "2m59.56s" (digit after "m").
_DURATION_PART = re.compile(r"(\d+(?:\.\d+)?)\s*([hms])", re.IGNORECASE)


def _parse_groq_duration(value: str | None) -> float | None:
    """Parse values like '7.66s', '2m59.56s', '1h30m' to seconds."""
    if not value:
        return None
    s = value.strip()
    if not s:
        return None
    total = 0.0
    pairs = _DURATION_PART.findall(s)
    if pairs:
        for num_s, unit in pairs:
            n = float(num_s)
            u = unit.lower()
            if u == "h":
                total += n * 3600
            elif u == "m":
                total += n * 60
            else:
                total += n
        return total if total > 0 else None
    if s.endswith("s") and "m" not in s.lower() and "h" not in s.lower():
        try:
            return float(s[:-1].strip())
        except ValueError:
            pass
    return None


def _retry_after_seconds(headers: httpx.Headers) -> float | None:
    raw = headers.get("retry-after")
    if raw is None or not str(raw).strip():
        return None
    text = str(raw).strip()
    try:
        sec = float(text)
        return sec if sec > 0 else None
    except ValueError:
        pass
    try:
        when = email.utils.parsedate_to_datetime(text)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        now = datetime.now(when.tzinfo)
        delta = (when - now).total_seconds()
        return delta if delta > 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def _header_int(headers: httpx.Headers, name: str) -> int | None:
    v = headers.get(name)
    if v is None or not str(v).strip():
        return None
    try:
        return int(float(str(v).strip()))
    except ValueError:
        return None


def daily_quota_exhausted(response: httpx.Response) -> bool:
    """True when Groq signals no daily requests left (RPD), per x-ratelimit-* docs."""
    rem = _header_int(response.headers, "x-ratelimit-remaining-requests")
    if rem is not None and rem <= 0:
        return True
    return False


def wait_seconds_before_retry(
    response: httpx.Response,
    *,
    max_sleep: float,
    default_sleep: float = 8.0,
) -> float:
    """How long to sleep before retrying a non-daily 429 (TPM/RPM style windows)."""
    h = response.headers
    ra = _retry_after_seconds(h)
    if ra is not None and ra > 0:
        return min(ra + 0.5, max_sleep)
    token_reset = _parse_groq_duration(h.get("x-ratelimit-reset-tokens"))
    if token_reset is not None and token_reset > 0:
        return min(token_reset + 1.0, max_sleep)
    return min(default_sleep, max_sleep)


def format_daily_quota_message(response: httpx.Response) -> str:
    h = response.headers
    parts = [
        "Groq API daily request quota appears exhausted (HTTP 429).",
        "Per https://console.groq.com/docs/rate-limits — x-ratelimit-remaining-requests is 0.",
        "Wait until the daily window resets or upgrade your plan; this run stops here.",
    ]
    reset = h.get("x-ratelimit-reset-requests")
    if reset:
        parts.append(f"x-ratelimit-reset-requests: {reset}")
    rem_tok = h.get("x-ratelimit-remaining-tokens")
    if rem_tok is not None:
        parts.append(f"x-ratelimit-remaining-tokens: {rem_tok}")
    try:
        raw = response.text[:1500]
        if raw.strip():
            parts.append(f"Response body (truncated): {raw}")
    except Exception:
        pass
    return "\n".join(parts)


def find_429_response(exc: BaseException) -> httpx.Response | None:
    """Locate an httpx 429 response on groq.RateLimitError or chained exceptions."""
    visited: set[int] = set()

    def walk(e: BaseException | None) -> httpx.Response | None:
        if e is None or id(e) in visited:
            return None
        visited.add(id(e))
        if _GroqRateLimitError is not None and isinstance(e, _GroqRateLimitError):
            r = getattr(e, "response", None)
            if isinstance(r, httpx.Response):
                return r
        r = getattr(e, "response", None)
        if isinstance(r, httpx.Response) and r.status_code == 429:
            return r
        if isinstance(e, BaseExceptionGroup):
            for sub in e.exceptions:
                got = walk(sub)
                if got is not None:
                    return got
            return None
        got = walk(e.__cause__)
        if got is not None:
            return got
        if e.__context__ is not e.__cause__:
            return walk(e.__context__)
        return None

    return walk(exc)
