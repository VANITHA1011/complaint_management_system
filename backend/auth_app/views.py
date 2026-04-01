import os
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import User
from django.contrib.auth import logout as auth_logout


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def register_api(request):
    """
    POST /api/register/
    Body: { name, email, password, role }
    """

    name = (request.data.get("name") or "").strip()
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    role = (request.data.get("role") or "").strip().lower()
    authority_level = (request.data.get("authority_level") or "").strip().lower()
    if not authority_level:
        authority_level = None

    if not name or not email or not password or not role:
        return Response(
            {"success": False, "error": "Missing required fields: name, email, password, role"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role not in {User.ROLE_CITIZEN, User.ROLE_AUTHORITY, User.ROLE_ADMIN}:
        return Response(
            {"success": False, "error": "Invalid role. Must be 'citizen', 'authority', or 'admin'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role == User.ROLE_AUTHORITY and not authority_level:
        return Response(
            {"success": False, "error": "Authority level is required for authority role."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate email uniqueness (case-insensitive)
    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {"success": False, "error": "Email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.create(
            name=name,
            email=email,
            password=make_password(password),
            role=role,
            authority_level=authority_level if role == User.ROLE_AUTHORITY else None,
        )
    except IntegrityError:
        # Unique constraint race-condition safety
        return Response(
            {"success": False, "error": "Email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {"success": True, "user_id": user.id, "name": user.name, "role": user.role, "authority_level": user.authority_level},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def login_api(request):
    """
    POST /api/login/
    Body: { email, password }
    """

    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {"success": False, "message": "Email and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response(
            {"success": False, "message": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not check_password(password, user.password):
        return Response(
            {"success": False, "message": "Invalid email or password"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "success": True,
            "message": "Login successful",
            "user_id": user.id,
            "name": user.name,
            "role": user.role,
            "authority_level": user.authority_level,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def google_login_api(request):
    """
    POST /api/google-login/
    Body: { email, name }
    """
    email = (request.data.get("email") or "").strip().lower()
    name = (request.data.get("name") or "").strip()

    if not email:
        return Response(
            {"success": False, "message": "Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not name:
        name = email.split("@")[0]

    # Create user if not present. We need password + role defaults because
    # these fields are required in our custom User model.
    try:
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "name": name,
                "password": make_password(os.urandom(24).hex()), # Random password
                "role": User.ROLE_CITIZEN,
            },
        )
    except Exception as e:
        print(f"Error in google_login_api: {str(e)}")
        return Response(
            {"success": False, "message": "An error occurred during Google login."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Keep profile name updated when user logs in with Google.
    if not created and name and user.name != name:
        user.name = name
        user.save(update_fields=["name"])

    return Response(
        {
            "success": True,
            "message": "Google login success",
            "user_id": user.id,
            "name": user.name,
            "role": user.role,
            "authority_level": user.authority_level,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def logout_api(request):
    """
    POST /api/logout/
    Logs out the user (clears session)
    """
    try:
        # Django logout - clears session data
        auth_logout(request)
        return Response(
            {"success": True, "message": "Logout successful"},
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response(
            {"success": False, "error": "Logout failed"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

