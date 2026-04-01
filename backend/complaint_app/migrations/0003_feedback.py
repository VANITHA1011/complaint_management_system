from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('complaint_app', '0002_complaint_extra_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='Feedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('complaint_id', models.CharField(max_length=50)),
                ('citizen_name', models.CharField(max_length=150)),
                ('rating', models.IntegerField()),
                ('message', models.TextField()),
                ('category', models.CharField(blank=True, max_length=100, null=True)),
                ('resolved_by', models.CharField(blank=True, max_length=50, null=True)),
                ('feedback_date', models.CharField(blank=True, max_length=20, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={'db_table': 'feedback', 'ordering': ['-created_at']},
        ),
    ]
