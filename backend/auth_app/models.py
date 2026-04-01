from django.db import models

from django.contrib.auth.hashers import make_password


class User(models.Model):
    """
    Civix application user.
    Note: we intentionally store a hashed password string in `password`.
    """

    ROLE_CITIZEN = "citizen"
    ROLE_AUTHORITY = "authority"
    ROLE_ADMIN = "admin"
    ROLE_CHOICES = [
        (ROLE_CITIZEN, "Citizen"),
        (ROLE_AUTHORITY, "Authority"),
        (ROLE_ADMIN, "Admin"),
    ]

    name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    authority_level = models.CharField(max_length=50, null=True, blank=True)
    district = models.CharField(max_length=100, null=True, blank=True)
    ward = models.CharField(max_length=100, null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()

        # If someone set a raw password by accident, hash it.
        # For normal flow we set hashed password in the view, but this is a safety net.
        if self.password and not self.password.startswith("pbkdf2_") and not self.password.startswith("argon2_"):
            self.password = make_password(self.password)

        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"

