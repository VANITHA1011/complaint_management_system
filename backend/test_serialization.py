#!/usr/bin/env python
import os
import django
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from complaint_app.views import _serialize_complaint
from complaint_app.models import Complaint

# Test the serialization directly
print("Testing complaint serialization:")
print("-" * 50)

try:
    complaint = Complaint.objects.get(id=59)
    serialized = _serialize_complaint(complaint)
    print(f"Complaint 59 serialized data:")
    print(f"  current_level: {serialized['current_level']}")
    print(f"  status: {serialized['status']}")
    print(f"  level_started_at: {serialized['level_started_at']}")
    print(f"  current_level_sla_minutes: {serialized['current_level_sla_minutes']}")
    
    complaint = Complaint.objects.get(id=1)
    serialized = _serialize_complaint(complaint)
    print(f"\nComplaint 1 serialized data:")
    print(f"  current_level: {serialized['current_level']}")
    print(f"  status: {serialized['status']}")
    print(f"  level_started_at: {serialized['level_started_at']}")
    print(f"  current_level_sla_minutes: {serialized['current_level_sla_minutes']}")
    
except Complaint.DoesNotExist:
    print("Complaint not found")
except Exception as e:
    print(f"Error: {e}")
