from django.urls import path

from . import views


urlpatterns = [
    path("register/", views.register_api, name="register_api"),
    path("login/", views.login_api, name="login_api"),
    path("google-login/", views.google_login_api, name="google_login_api"),
    path("logout/", views.logout_api, name="logout_api"),
]

