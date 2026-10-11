"""Pure helpers for sign-up / login / password reset (no Django imports, easy to unit test)."""
import re
import secrets

USERNAME_RE = re.compile(r'^[A-Za-z0-9_.]{3,30}$')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')
PHONE_RE = re.compile(r'^\+?\d{10,15}$')
OTP_RE = re.compile(r'^\d{6}$')


def normalize_phone(raw):
    """'+91 98765-43210' -> '+919876543210'"""
    return re.sub(r'[\s\-()]', '', raw or '')


def check_username(username):
    """Returns an error message, or '' when the user ID is acceptable."""
    s = (username or '').strip()
    if not s:
        return 'Enter a user ID.'
    if not USERNAME_RE.match(s):
        return 'Use 3 to 30 letters, numbers, dots or underscores.'
    if PHONE_RE.match(s):       # login accepts mobile numbers too, so an ID like this would clash
        return "A user ID can't look like a mobile number. Add a letter."
    return ''


def check_email(email):
    if not EMAIL_RE.match((email or '').strip()):
        return 'Enter a valid email address.'
    return ''


def check_phone(phone):
    if not PHONE_RE.match(normalize_phone(phone)):
        return 'Enter a valid mobile number (10 to 15 digits, optional +).'
    return ''


def new_otp():
    """6-digit one-time code from a cryptographically secure source."""
    return f'{secrets.randbelow(10 ** 6):06d}'
