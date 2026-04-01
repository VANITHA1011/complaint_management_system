from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Complaint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("citizen_name", models.CharField(max_length=150)),
                ("description", models.TextField()),
                ("current_level", models.CharField(
                    choices=[("ward","Ward"),("municipality","Municipality"),("district","District"),("state","State")],
                    default="ward", max_length=20)),
                ("status", models.CharField(
                    choices=[("pending","Pending"),("escalated","Escalated"),("resolved","Resolved")],
                    default="pending", max_length=20)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("escalated_at", models.DateTimeField(blank=True, null=True)),
                ("escalation_reason", models.TextField(blank=True, null=True)),
                ("citizen_id", models.BigIntegerField(blank=True, null=True)),
            ],
            options={"db_table": "complaint", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ComplaintHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("complaint", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="history",
                    to="complaint_app.complaint")),
                ("from_level", models.CharField(max_length=20)),
                ("to_level", models.CharField(blank=True, max_length=20, null=True)),
                ("action", models.CharField(
                    choices=[("auto_escalated","Auto Escalated"),("manual_escalated","Manual Escalated"),("resolved","Resolved")],
                    max_length=20)),
                ("reason", models.TextField(blank=True, null=True)),
                ("timestamp", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={"db_table": "complaint_history", "ordering": ["timestamp"]},
        ),
    ]
