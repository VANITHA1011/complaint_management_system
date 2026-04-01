from django.db import models
from django.utils import timezone


LEVEL_WARD = "ward"
LEVEL_MUNICIPALITY = "municipality"
LEVEL_DISTRICT = "district"
LEVEL_STATE = "state"

LEVEL_ORDER = [LEVEL_WARD, LEVEL_MUNICIPALITY, LEVEL_DISTRICT, LEVEL_STATE]

LEVEL_CHOICES = [(l, l.capitalize()) for l in LEVEL_ORDER]

STATUS_PENDING = "pending"
STATUS_IN_PROGRESS = "in_progress"  # Being actively worked on at current level
STATUS_ESCALATED = "escalated"  # Only shown when timeout happens and moves to next level
STATUS_RESOLVED = "resolved"

STATUS_CHOICES = [
    (STATUS_PENDING, "Pending"),
    (STATUS_IN_PROGRESS, "In Progress"),
    (STATUS_ESCALATED, "Escalated"),
    (STATUS_RESOLVED, "Resolved"),
]


class Complaint(models.Model):
    citizen_name = models.CharField(max_length=150)
    title = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    description = models.TextField()
    district = models.CharField(max_length=100, null=True, blank=True)
    area = models.CharField(max_length=100, null=True, blank=True)
    priority = models.CharField(max_length=20, null=True, blank=True)
    current_level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default=LEVEL_WARD)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(default=timezone.now)
    escalated_at = models.DateTimeField(null=True, blank=True)
    escalation_reason = models.TextField(null=True, blank=True)
    escalating_officer = models.CharField(max_length=150, null=True, blank=True)
    
    # Proof Fields
    image_proof = models.TextField(null=True, blank=True)  # Original complaint proof
    resolution_officer = models.CharField(max_length=150, null=True, blank=True)
    resolution_proof = models.TextField(null=True, blank=True)  # Resolution proof
    citizen_accepted = models.BooleanField(default=False)

    # Tracks exactly when complaint arrived at its CURRENT level (resets on every escalation)
    # This is the authoritative SLA start time for the active level's countdown
    level_started_at = models.DateTimeField(null=True, blank=True)

    # citizen user id (optional reference — kept loose to avoid FK dependency)
    citizen_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "complaint"
        ordering = ["-created_at"]

    def __str__(self):
        return f"#{self.id} [{self.current_level}] {self.status}"

    @property
    def is_editable(self):
        return self.status == STATUS_PENDING

    @property
    def next_level(self):
        idx = LEVEL_ORDER.index(self.current_level)
        if idx < len(LEVEL_ORDER) - 1:
            return LEVEL_ORDER[idx + 1]
        return None  # already at state level


class ComplaintHistory(models.Model):
    ACTION_AUTO = "auto_escalated"
    ACTION_MANUAL = "manual_escalated"
    ACTION_RESOLVED = "resolved"

    ACTION_CHOICES = [
        (ACTION_AUTO, "Auto Escalated"),
        (ACTION_MANUAL, "Manual Escalated"),
        (ACTION_RESOLVED, "Resolved"),
    ]

    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="history")
    from_level = models.CharField(max_length=20)
    to_level = models.CharField(max_length=20, null=True, blank=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    reason = models.TextField(null=True, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "complaint_history"
        ordering = ["timestamp"]

    def __str__(self):
        return f"Complaint #{self.complaint_id} | {self.action} @ {self.timestamp}"


class Feedback(models.Model):
    complaint_id  = models.CharField(max_length=50)
    citizen_name  = models.CharField(max_length=150)
    rating        = models.IntegerField()
    message       = models.TextField()
    category      = models.CharField(max_length=100, null=True, blank=True)
    resolved_by   = models.CharField(max_length=50, null=True, blank=True)
    feedback_date = models.CharField(max_length=20, null=True, blank=True)
    created_at    = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "feedback"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Feedback #{self.id} for {self.complaint_id} — {self.rating}★"
