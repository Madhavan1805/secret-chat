import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0018_status_audience_and_longer_filenames'),
    ]

    operations = [
        # a song on a photo status
        migrations.AddField(
            model_name='status',
            name='music_file',
            field=models.FileField(blank=True, max_length=255, null=True, upload_to='status_music/'),
        ),
        migrations.AddField(
            model_name='status',
            name='music_title',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        # Instagram-style notes
        migrations.CreateModel(
            name='Note',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=60)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='note', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
