#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from django.utils import timezone
from complaint_app.models import Complaint

# Check current status of all complaints
print("Current complaint status:")
print("-" * 60)
for c in Complaint.objects.all().order_by('-id')[:10]:  # Show last 10 complaints
    print(f"ID: {c.id:3d} | Level: {c.current_level:12s} | Status: {c.status:10s} | Title: {c.title[:30]}")

print("-" * 60)

# Specifically check a few complaints
try:
    complaint = Complaint.objects.get(id=1)
    print(f"\nComplaint 1 Details:")
    print(f"  Current Level: {complaint.current_level}")
    print(f"  Status: {complaint.status}")
    print(f"  Level Started At: {complaint.level_started_at}")
    print(f"  Escalated At: {complaint.escalated_at}")
except Complaint.DoesNotExist:
    print("Complaint 1 not found")
