from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('complaint_app', '0001_initial'),
    ]

    operations = [
        migrations.AddField(model_name='complaint', name='title',
            field=models.CharField(blank=True, max_length=255, null=True)),
        migrations.AddField(model_name='complaint', name='category',
            field=models.CharField(blank=True, max_length=100, null=True)),
        migrations.AddField(model_name='complaint', name='district',
            field=models.CharField(blank=True, max_length=100, null=True)),
        migrations.AddField(model_name='complaint', name='area',
            field=models.CharField(blank=True, max_length=100, null=True)),
        migrations.AddField(model_name='complaint', name='priority',
            field=models.CharField(blank=True, max_length=20, null=True)),
    ]
