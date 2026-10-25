from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0020_note_music'),
    ]

    operations = [
        migrations.AddField(model_name='status', name='music_artist', field=models.CharField(blank=True, default='', max_length=60)),
        migrations.AddField(model_name='status', name='music_url', field=models.URLField(blank=True, default='', max_length=500)),
        migrations.AddField(model_name='note', name='music_url', field=models.URLField(blank=True, default='', max_length=500)),
    ]
