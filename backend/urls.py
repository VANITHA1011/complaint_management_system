from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.views.static import serve
import views
import os

FRONTEND_DIR = os.path.join(settings.BASE_DIR.parent, "frontend")

urlpatterns = [
    path("", views.index),
    path("admin/", admin.site.urls),
    path("api/", include("auth_app.urls")),
    path("api/complaints/", include("complaint_app.urls")),
    # Serve frontend assets at root level
    path("css/<path:path>", serve, {"document_root": os.path.join(FRONTEND_DIR, "css")}),
    path("js/<path:path>", serve, {"document_root": os.path.join(FRONTEND_DIR, "js")}),
    path("img/<path:path>", serve, {"document_root": os.path.join(FRONTEND_DIR, "img")}),
    path("google-auth.js", serve, {"document_root": FRONTEND_DIR, "path": "google-auth.js"}),
    # Serve any .html page from frontend folder
    path("<path:page>", views.serve_page),
]
