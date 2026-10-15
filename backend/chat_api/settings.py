"""
Django settings for chat_api project (local + Render + Railway ready).
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------- security
# Deploy-la SECRET_KEY, DEBUG env variables set pannunga.
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-local-dev-key-change-me')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME')     # Render thaanaa set pannum
RAILWAY_HOST = os.environ.get('RAILWAY_PUBLIC_DOMAIN')       # Railway thaanaa set pannum

ALLOWED_HOSTS = ['localhost', '127.0.0.1']
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)
if RAILWAY_HOST:
    ALLOWED_HOSTS.append(RAILWAY_HOST)
# custom domain irundha: EXTRA_ALLOWED_HOSTS="a.com,b.com"
ALLOWED_HOSTS += [h.strip() for h in os.environ.get('EXTRA_ALLOWED_HOSTS', '').split(',') if h.strip()]


# ---------------------------------------------------------------- apps
INSTALLED_APPS = [
    'daphne',                      # staticfiles-ku MUNNADI irukkanum
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'channels',
    'chat',
]

ASGI_APPLICATION = 'chat_api.asgi.application'

# REDIS_URL set panna Redis layer use aagum (multiple instances ku).
# Illana InMemory layer (1 instance-la mattum work aagum).
REDIS_URL = os.environ.get('REDIS_URL', '')
if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
    }

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'chat_api.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'chat_api.wsgi.application'


# ---------------------------------------------------------------- database
# DATABASE_URL set panna (Railway Postgres / Neon / Supabase) athu use aagum.
# Illana local-la db.sqlite3 use aagum.
DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=600,
    )
}


# ---------------------------------------------------------------- passwords
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ---------------------------------------------------------------- i18n
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------- static + media
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# NOTE: Railway/Render-la disk temporary. Redeploy-la media/ azhinjidum.
# Permanent-aa venum-na Railway Volume / Cloudinary / S3 use pannunga.
MEDIA_URL = '/media/'
_volume = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')
MEDIA_ROOT = Path(_volume) / 'media' if _volume else BASE_DIR / 'media'


# ---------------------------------------------------------------- auth / DRF
AUTH_USER_MODEL = 'chat.CustomUser'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
}


# ---------------------------------------------------------------- CORS / CSRF
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CSRF_TRUSTED_ORIGINS = []

# Frontend deploy pannina antha URL-a FRONTEND_URL-la podunga
# e.g. https://secretchat.vercel.app  (trailing slash illama)
FRONTEND_URL = os.environ.get('FRONTEND_URL', '').rstrip('/')
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)
    CSRF_TRUSTED_ORIGINS.append(FRONTEND_URL)
if RENDER_HOST:
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_HOST}')
if RAILWAY_HOST:
    CSRF_TRUSTED_ORIGINS.append(f'https://{RAILWAY_HOST}')


# ---------------------------------------------------------------- email
# Default: terminal-la print aagum (local dev).
# GMAIL_USER + GMAIL_APP_PASSWORD set panna real mail pogum.
# NOTE: Railway/Render-la SMTP ports block aagalaam. Mail vara-la na Resend / Brevo use pannunga.
MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}

_gmail_user = os.environ.get('GMAIL_USER', '')
_gmail_app_password = os.environ.get('GMAIL_APP_PASSWORD', '')

if _gmail_user and _gmail_app_password:
    MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
            'OPTIONS': {
                'host': 'smtp.gmail.com',
                'port': 587,
                'use_tls': True,
                'username': _gmail_user,
                'password': _gmail_app_password,
                'timeout': 15,
            },
        },
    }
    DEFAULT_FROM_EMAIL = f'Secret Chat <{_gmail_user}>'


# ---------------------------------------------------------------- production hardening
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
# redeploy status update
