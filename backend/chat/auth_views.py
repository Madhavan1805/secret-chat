"""Login, sign-up and forgot-password endpoints.

POST auth/register/   create an account (user ID + password + confirm + email OR mobile)
GET  auth/check/      is this user ID free?   (?username=...)
POST login/           log in with user ID, email or mobile number + password
POST auth/forgot/     send a 6-digit code (email) to reset the password
POST auth/reset/      check the code and set a new password

All of them are public, ignore any old/stale token header and are rate limited.
"""
import json
import logging
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.decorators import (
    api_view, authentication_classes, permission_classes, throttle_classes)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .auth_utils import (
    OTP_RE, PHONE_RE, check_email, check_phone, check_username, new_otp, normalize_phone)
from .device_auth import new_device_session
from .models import CustomUser, DeviceSession, PasswordResetOTP

logger = logging.getLogger(__name__)

OTP_TTL = timedelta(minutes=10)
OTP_COOLDOWN_SECONDS = 60
OTP_MAX_PER_HOUR = 5
OTP_MAX_ATTEMPTS = 5


# ------------------------------------------------------------- rate limits
# (a `rate` set on the class means no change to REST_FRAMEWORK settings is needed)
class LoginThrottle(AnonRateThrottle):
    scope = 'auth_login'
    rate = '20/min'


class RegisterThrottle(AnonRateThrottle):
    scope = 'auth_register'
    rate = '15/hour'


class CheckThrottle(AnonRateThrottle):
    scope = 'auth_check'
    rate = '90/min'


class ForgotThrottle(AnonRateThrottle):
    scope = 'auth_forgot'
    rate = '10/hour'


class ResetThrottle(AnonRateThrottle):
    scope = 'auth_reset'
    rate = '20/hour'


# ----------------------------------------------------------------- helpers
def find_user(identifier):
    """Accepts a user ID, an email address or a mobile number."""
    ident = (identifier or '').strip()
    if not ident:
        return None
    if '@' in ident:
        return CustomUser.objects.filter(email__iexact=ident).first()
    phone = normalize_phone(ident)
    if PHONE_RE.match(phone):
        user = CustomUser.objects.filter(phone_number=phone).first()
        if user:
            return user
    return (CustomUser.objects.filter(username=ident).first()
            or CustomUser.objects.filter(username__iexact=ident).first())


def password_problem(password, user=None):
    """Runs Django's AUTH_PASSWORD_VALIDATORS. Returns a message or ''."""
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return ' '.join(exc.messages)
    return ''


def send_sms(number, text):
    """Plug an SMS provider in here (Twilio, MSG91, Fast2SMS ...). Return True when sent.
    Until then mobile-only accounts cannot receive a reset code."""
    logger.warning('SMS provider not configured, message for %s was not sent.', number)
    return False


def send_email_via_brevo(to_email, subject, text):
    """Sends over HTTPS (port 443) with Brevo's API. Railway / Render block SMTP ports, so Gmail SMTP
    never delivers there. Needs BREVO_API_KEY and BREVO_SENDER_EMAIL (a sender verified in Brevo)."""
    payload = json.dumps({
        'sender': {'name': 'Secret Chat', 'email': settings.BREVO_SENDER_EMAIL},
        'to': [{'email': to_email}],
        'subject': subject,
        'textContent': text,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.brevo.com/v3/smtp/email', data=payload, method='POST',
        headers={'api-key': settings.BREVO_API_KEY, 'content-type': 'application/json',
                 'accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=15):      # raises on any non-2xx answer
        pass


def deliver_otp(user, code):
    text = (f'Your Secret Chat code is {code}. It expires in 10 minutes. '
            'If you did not ask to reset your password, ignore this message.')
    subject = 'Your Secret Chat password reset code'
    if user.email:
        try:
            if getattr(settings, 'BREVO_API_KEY', '') and getattr(settings, 'BREVO_SENDER_EMAIL', ''):
                send_email_via_brevo(user.email, subject, text)
            else:
                # uses the "default" entry of MAILERS (Django 6.1+) or the old EMAIL_* settings (older Django)
                send_mail(subject, text, getattr(settings, 'DEFAULT_FROM_EMAIL', None), [user.email])
        except Exception:  # SMTP down / blocked port / wrong key: never crash the request
            logger.exception('Could not send the reset code email to user %s', user.pk)
    elif user.phone_number:
        send_sms(user.phone_number, text)
    if settings.DEBUG:      # local testing: the code is visible in the server terminal
        print(f'[DEV] Password reset code for {user.username}: {code}')


# --------------------------------------------------------------------- login
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login_view(request):
    identifier = request.data.get('username') or request.data.get('identifier')
    password = request.data.get('password') or ''
    user = find_user(identifier)
    if user and authenticate(username=user.username, password=password):
        session = new_device_session(request, user)      # one token per device
        return Response({'status': 'success', 'token': session.key, 'username': user.username, 'id': user.id})
    return Response({'error': 'Incorrect user ID or password.'}, status=400)


# ------------------------------------------------------------------ register
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def register_view(request):
    data = request.data
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    confirm = data.get('confirm_password') or ''
    email = (data.get('email') or '').strip()
    phone = normalize_phone(data.get('phone_number') or '')
    errors = {}

    problem = check_username(username)
    if problem:
        errors['username'] = problem
    elif CustomUser.objects.filter(username__iexact=username).exists():
        errors['username'] = 'This user ID is taken.'

    if not email and not phone:
        errors['contact'] = 'Add an email address or a mobile number.'
    if email:
        problem = check_email(email)
        if problem:
            errors['email'] = problem
        elif CustomUser.objects.filter(email__iexact=email).exists():
            errors['email'] = 'An account with this email already exists.'
    if phone:
        problem = check_phone(phone)
        if problem:
            errors['phone_number'] = problem
        elif CustomUser.objects.filter(phone_number=phone).exists():
            errors['phone_number'] = 'An account with this mobile number already exists.'

    problem = password_problem(password, CustomUser(username=username, email=email))
    if problem:
        errors['password'] = problem
    if password != confirm:
        errors['confirm_password'] = "Passwords don't match."

    if errors:
        return Response(errors, status=400)

    try:
        CustomUser.objects.create_user(
            username=username, password=password, email=email, phone_number=phone or None)
    except IntegrityError:      # someone took it a millisecond earlier
        return Response({'username': 'This user ID or contact is already in use.'}, status=400)
    return Response({'status': 'created', 'username': username}, status=201)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([CheckThrottle])
def check_view(request):
    """Live 'is this user ID free?' check for the sign-up form (user ID only, on purpose)."""
    username = (request.query_params.get('username') or '').strip()
    if check_username(username):
        return Response({'username_taken': False, 'valid': False})
    return Response({'username_taken': CustomUser.objects.filter(username__iexact=username).exists(),
                     'valid': True})


# ------------------------------------------------------------ forgot / reset
GENERIC_FORGOT = {
    'status': 'ok',
    'message': 'If an account matches, a 6-digit code was sent. It expires in 10 minutes.',
}


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ForgotThrottle])
def forgot_view(request):
    """Always answers the same way, so nobody can use it to find out who has an account."""
    user = find_user(request.data.get('identifier'))
    if user and user.is_active:
        now = timezone.now()
        recent = PasswordResetOTP.objects.filter(user=user, created_at__gte=now - timedelta(hours=1))
        last = recent.order_by('-created_at').first()
        cooling = bool(last and (now - last.created_at).total_seconds() < OTP_COOLDOWN_SECONDS)
        if recent.count() < OTP_MAX_PER_HOUR and not cooling:
            code = new_otp()
            PasswordResetOTP.objects.filter(user=user, used=False).update(used=True)   # older codes die
            PasswordResetOTP.objects.create(user=user, code_hash=make_password(code), expires_at=now + OTP_TTL)
            deliver_otp(user, code)
    return Response(GENERIC_FORGOT)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ResetThrottle])
def reset_view(request):
    data = request.data
    otp = str(data.get('otp') or '').strip()
    new_password = data.get('new_password') or ''
    confirm = data.get('confirm_password') or ''
    user = find_user(data.get('identifier'))

    errors = {}
    if not OTP_RE.match(otp):
        errors['otp'] = 'Enter the 6-digit code.'
    problem = password_problem(new_password, user)
    if problem:
        errors['new_password'] = problem
    if new_password != confirm:
        errors['confirm_password'] = "Passwords don't match."
    if errors:
        return Response(errors, status=400)

    entry = None
    if user and user.is_active:
        entry = (PasswordResetOTP.objects
                 .filter(user=user, used=False, expires_at__gt=timezone.now())
                 .order_by('-created_at').first())
    if not entry or entry.attempts >= OTP_MAX_ATTEMPTS:
        return Response({'otp': 'This code is not valid or has expired. Ask for a new code.'}, status=400)

    if not check_password(otp, entry.code_hash):
        entry.attempts += 1
        entry.save(update_fields=['attempts'])
        left = OTP_MAX_ATTEMPTS - entry.attempts
        message = (f'Wrong code. {left} {"try" if left == 1 else "tries"} left.' if left > 0
                   else 'Too many wrong codes. Ask for a new code.')
        return Response({'otp': message}, status=400)

    user.set_password(new_password)
    user.save(update_fields=['password'])
    entry.used = True
    entry.save(update_fields=['used'])
    Token.objects.filter(user=user).delete()        # logs the account out on every device
    DeviceSession.objects.filter(user=user).delete()
    return Response({'status': 'ok'})
