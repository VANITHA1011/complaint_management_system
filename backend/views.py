from django.shortcuts import render, redirect
from django.http import Http404
import os
from django.conf import settings

FRONTEND_DIR = os.path.join(settings.BASE_DIR.parent, "frontend")

# Pages that should only be loaded via the router (not directly navigated to)
DASHBOARD_PAGES = {
    'ward-dashboard.html', 'municipality-dashboard.html',
    'district-dashboard.html', 'state-dashboard.html',
    'admin-dashboard.html',
}


def index(request):
    return render(request, "home.html")


def serve_page(request, page):
    if not page.endswith(".html"):
        raise Http404
    filepath = os.path.join(FRONTEND_DIR, page)
    if not os.path.exists(filepath):
        raise Http404
    # Dashboard pages fetched by router.js (via fetch API) are served normally.
    # Direct browser navigation (sec-fetch-mode: navigate) → redirect to / so URL stays clean.
    sec_fetch_mode = request.META.get('HTTP_SEC_FETCH_MODE', '')
    if page in DASHBOARD_PAGES and sec_fetch_mode == 'navigate':
        return redirect('/')
    return render(request, page)
