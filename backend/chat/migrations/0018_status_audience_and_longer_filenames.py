from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0017_privacy_devices_polls_and_more'),
    ]

    operations = [
        # WhatsApp-style status audience: all / except / only (+ close friends)
        migrations.AlterField(
            model_name='status',
            name='privacy',
            field=models.CharField(choices=[('all', 'All friends'), ('close', 'Close friends only'), ('except', 'All friends except...'), ('only', 'Only share with...')], default='all', max_length=10),
        ),
        migrations.AddField(
            model_name='status',
            name='privacy_users',
            field=models.ManyToManyField(blank=True, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        # long file names (phone videos) were rejected: "filename has at most 100 characters"
        migrations.AlterField(
            model_name='status',
            name='media_file',
            field=models.FileField(max_length=255, upload_to='status_media/'),
        ),
        migrations.AlterField(
            model_name='message',
            name='file_url',
            field=models.FileField(blank=True, max_length=255, null=True, upload_to='chat_media/'),
        ),
        migrations.AlterField(
            model_name='message',
            name='voice_note',
            field=models.FileField(blank=True, max_length=255, null=True, upload_to='voice_notes/'),
        ),
        migrations.AlterField(
            model_name='customuser',
            name='profile_picture',
            field=models.ImageField(blank=True, max_length=255, null=True, upload_to='profile_pics/'),
        ),
        migrations.AlterField(
            model_name='chat',
            name='group_photo',
            field=models.ImageField(blank=True, max_length=255, null=True, upload_to='group_photos/'),
        ),
    ]
