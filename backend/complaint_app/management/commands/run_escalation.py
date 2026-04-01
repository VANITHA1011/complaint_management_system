"""
Management command: python manage.py run_escalation

Runs the auto-escalation loop every 60 seconds.
Keep this running as a background process alongside the Django server.
"""

import time
from django.core.management.base import BaseCommand
from complaint_app.escalation import run_auto_escalation

POLL_INTERVAL = 10  # seconds


class Command(BaseCommand):
    help = "Continuously checks for SLA breaches and auto-escalates complaints."

    def handle(self, *args, **options):
        self.stdout.write("Auto-escalation service started. Polling every 60 seconds...")
        while True:
            try:
                count = run_auto_escalation()
                if count:
                    self.stdout.write(f"[{self._now()}] Auto-escalated {count} complaint(s).")
                else:
                    self.stdout.write(f"[{self._now()}] No escalations needed.")
            except Exception as e:
                self.stderr.write(f"[{self._now()}] Error during escalation: {e}")
            time.sleep(POLL_INTERVAL)

    @staticmethod
    def _now():
        from django.utils import timezone
        return timezone.now().strftime("%Y-%m-%d %H:%M:%S")
