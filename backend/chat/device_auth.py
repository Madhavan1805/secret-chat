"""Per-device login tokens.

Before, every device of a user shared ONE token, so it was impossible to sign out a single phone.
Now every login creates its own DeviceSession.  Tokens issued before this change (rest_framework
authtoken) keep working until the person logs in again, so nobody is logged out by the update.
"""
import re
import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import DeviceSession

TOUCH_EVERY = timedelta(minutes=5)       # do not write to the database on every request


class DeviceTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        try:
            session = DeviceSession.objects.select_related('user').get(key=key)
        except DeviceSession.DoesNotExist:
            return super().authenticate_credentials(key)          # old shared token
        if not session.user.is_active:
            raise AuthenticationFailed('User inactive or deleted.')
        now = timezone.now()
        if now - session.last_used > TOUCH_EVERY:
            DeviceSession.objects.filter(pk=session.pk).update(last_used=now)
        return (session.user, session)


def user_for_key(key):
    """Used by the WebSocket: returns the user for a device token or an old token, else None."""
    from rest_framework.authtoken.models import Token
    if not key:
        return None
    s = DeviceSession.objects.select_related('user').filter(key=key).first()
    if s:
        return s.user if s.user.is_active else None
    t = Token.objects.select_related('user').filter(key=key).first()
    return t.user if t and t.user.is_active else None


def describe_device(request):
    """'Chrome on Android' from the User-Agent header (good enough for a devices list)."""
    ua = request.META.get('HTTP_USER_AGENT', '') or ''
    if not ua:
        return 'Unknown device'
    if re.search(r'\bwv\b|; wv\)', ua):
        browser = 'Chatzy app'
    elif 'Edg' in ua:
        browser = 'Edge'
    elif 'OPR' in ua or 'Opera' in ua:
        browser = 'Opera'
    elif 'SamsungBrowser' in ua:
        browser = 'Samsung Internet'
    elif 'Firefox' in ua:
        browser = 'Firefox'
    elif 'Chrome' in ua or 'CriOS' in ua:
        browser = 'Chrome'
    elif 'Safari' in ua:
        browser = 'Safari'
    else:
        browser = 'Browser'
    if 'Android' in ua:
        system = 'Android'
    elif 'iPhone' in ua or 'iPad' in ua:
        system = 'iPhone / iPad'
    elif 'Windows' in ua:
        system = 'Windows'
    elif 'Mac OS' in ua:
        system = 'Mac'
    elif 'Linux' in ua:
        system = 'Linux'
    else:
        system = 'Unknown system'
    return f'{browser} on {system}'[:120]


def client_ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = fwd.split(',')[0].strip() if fwd else request.META.get('REMOTE_ADDR', '')
    return ip or None


def new_device_session(request, user):
    return _create(user, describe_device(request), client_ip(request))


def _create(user, name, ip):
    try:
        return DeviceSession.objects.create(key=secrets.token_hex(20), user=user, device_name=name, ip=ip)
    except Exception:          # an invalid IP string must never block a login
        return DeviceSession.objects.create(key=secrets.token_hex(20), user=user, device_name=name)
