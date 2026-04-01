"""
Auto-escalation engine.
Call `run_auto_escalation()` periodically (e.g., every 60 seconds).
Complaints that have been sitting at a non-final level for >= SLA_MINUTES
without being resolved are automatically escalated to the next level.

SLA start time = level_started_at (per-level timer), falling back to created_at.
Each level gets its own timer that starts when the complaint reaches that level.
"""

from django.utils import timezone
from datetime import timedelta

from .models import (
    Complaint, ComplaintHistory,
    STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_ESCALATED, STATUS_RESOLVED,
    LEVEL_ORDER,
)

from django.conf import settings

# Different SLA for each level
WARD_SLA_MINUTES = getattr(settings, "WARD_SLA_MINUTES", 5)  # Ward officer gets 5 minutes
MUNICIPAL_SLA_MINUTES = getattr(settings, "MUNICIPAL_SLA_MINUTES", 2)  # Municipal gets 2 minutes
DISTRICT_SLA_MINUTES = getattr(settings, "DISTRICT_SLA_MINUTES", 3)  # District gets 3 minutes
STATE_SLA_MINUTES = getattr(settings, "STATE_SLA_MINUTES", 10)  # State gets 10 minutes (final level)

def get_sla_minutes_for_level(level):
    """Get SLA minutes for a specific level"""
    level_sla_map = {
        "ward": WARD_SLA_MINUTES,
        "municipality": MUNICIPAL_SLA_MINUTES,
        "district": DISTRICT_SLA_MINUTES,
        "state": STATE_SLA_MINUTES,
    }
    return level_sla_map.get(level, WARD_SLA_MINUTES)


def run_auto_escalation():
    now = timezone.now()

    LEVEL_DISPLAY = {
        "ward": "Ward Officer",
        "municipality": "Municipality Officer",
        "district": "District Collector",
        "state": "State Authority",
    }

    escalated_count = 0
    
    # Check each level separately for proper per-level timing
    for level in LEVEL_ORDER[:-1]:  # Exclude final state level
        sla_minutes = get_sla_minutes_for_level(level)
        cutoff = now - timedelta(minutes=sla_minutes)
        
        from django.db.models import Q
        
        # Find complaints at this level that have exceeded their SLA
        # Escalate both PENDING and IN_PROGRESS complaints
        overdue_complaints = Complaint.objects.filter(
            current_level=level,
        ).filter(
            status__in=[STATUS_PENDING, STATUS_IN_PROGRESS]
        ).filter(
            Q(level_started_at__isnull=False, level_started_at__lte=cutoff) |
            Q(level_started_at__isnull=True, created_at__lte=cutoff)
        )

        for c in overdue_complaints:
            if c.next_level is None:
                continue

            from_level = c.current_level
            to_level = c.next_level

            # Mark as ESCALATED only after timeout, then move to next level as PENDING
            c.current_level = to_level
            c.status = STATUS_PENDING  # Start fresh at next level
            c.escalated_at = now
            c.level_started_at = now  # Fresh timer for the new level
            c.escalation_reason = f"Auto-escalated: SLA of {sla_minutes} minutes exceeded at {LEVEL_DISPLAY.get(from_level, from_level.capitalize())} level."
            c.escalating_officer = LEVEL_DISPLAY.get(from_level, from_level.capitalize())
            c.save(update_fields=[
                "current_level", "status", "escalated_at", "level_started_at",
                "escalation_reason", "escalating_officer"
            ])

            # Create history record showing the escalation
            ComplaintHistory.objects.create(
                complaint=c,
                from_level=from_level,
                to_level=to_level,
                action=ComplaintHistory.ACTION_AUTO,
                reason=c.escalation_reason,
                timestamp=now,
            )
            escalated_count += 1

    return escalated_count
