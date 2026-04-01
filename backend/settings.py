
import pymysql  # type: ignore
pymysql.version_info = (2, 2, 1, "final", 0)  # Fake version for Django
pymysql.install_as_MySQLdb()

import os
from pathlib import Path

# ---------------------------------------------------------------------
# BASIC SETTINGS
# ---------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

SECRET_KEY = "dev-secret-key"

DEBUG = True

ALLOWED_HOSTS = []


# ---------------------------------------------------------------------
# APPLICATIONS
# ---------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "auth_app",
    "complaint_app",
]


# ---------------------------------------------------------------------
# MIDDLEWARE
# ---------------------------------------------------------------------

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ---------------------------------------------------------------------
# URL / TEMPLATE
# ---------------------------------------------------------------------

ROOT_URLCONF = "urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [os.path.join(BASE_DIR.parent, "frontend")],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "wsgi.application"


# ---------------------------------------------------------------------
# DATABASE
# ---------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("DB_NAME", "civix_auth"),
        "USER": os.getenv("DB_USER", "root"),
        "PASSWORD": os.getenv("DB_PASSWORD", "Vani@2005"),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
        },
    }
}


# ---------------------------------------------------------------------
# PASSWORD VALIDATION
# ---------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = []


# ---------------------------------------------------------------------
# INTERNATIONALIZATION
# ---------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------
# STATIC FILES
# ---------------------------------------------------------------------

STATIC_URL = "/static/"
STATICFILES_DIRS = [os.path.join(BASE_DIR.parent, "frontend")]


# ---------------------------------------------------------------------
# CORS + REST
# ---------------------------------------------------------------------

CORS_ALLOW_ALL_ORIGINS = True

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}


# ---------------------------------------------------------------------
# DEFAULT PRIMARY KEY
# ---------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------
# COMPLAINT SYSTEM SETTINGS — SLA per level
# ---------------------------------------------------------------------
# Ward officer gets 5 minutes (initial processing time)
COMPLAINT_SLA_MINUTES = 2  # Legacy setting (kept for compatibility)
WARD_SLA_MINUTES = 5
# Municipal gets 2 minutes (quick decisions expected)
MUNICIPAL_SLA_MINUTES = 2
# District gets 3 minutes (more complex issues)
DISTRICT_SLA_MINUTES = 3
# State gets 10 minutes (final authority, complex issues)
STATE_SLA_MINUTES = 10
