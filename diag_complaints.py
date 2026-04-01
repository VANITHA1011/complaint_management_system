import os
import django
import sys

# Set up Django environment
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings')
django.setup()

from complaint_app.models import Complaint, ComplaintHistory

def diag():
    print("--- Complaint Diagnoses ---")
    complaints = Complaint.objects.all().order_by('-id')
    print(f"Total Complaints: {complaints.count()}")
    
    for c in complaints:
        print(f"ID: {c.id} | CID: {'CMP'+str(c.id).padStart(3,'0') if hasattr(str,'padStart') else 'CMP'+str(c.id).zfill(3)} | Level: {c.current_level} | Status: {c.status} | Created: {c.created_at} | Started: {c.level_started_at}")
        hist = c.history.all()
        if hist.exists():
            print("  History:")
            for h in hist:
                print(f"    - {h.timestamp}: {h.from_level} -> {h.to_level or 'None'} | Action: {h.action} | Reason: {h.reason[:50]}...")
        else:
            print("  No History.")
        print("-" * 30)

if __name__ == "__main__":
    diag()
