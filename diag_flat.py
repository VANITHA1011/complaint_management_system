import os
import django
import sys

# Set up Django environment
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from complaint_app.models import Complaint

with open('diag_flat.txt', 'w', encoding='utf-8') as f:
    f.write("--- Flat Diagnoses ---\n")
    for c in Complaint.objects.all().order_by('-id')[:20]:
        f.write(f"ID: {c.id} | Level: {c.current_level} | Status: {c.status} | Title: {c.title}\n")
