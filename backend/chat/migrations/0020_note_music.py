from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0019_status_music_and_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='note',
            name='text',
            field=models.CharField(blank=True, default='', max_length=60),
        ),
        migrations.AddField(
            model_name='note',
            name='music_file',
            field=models.FileField(blank=True, max_length=255, null=True, upload_to='note_music/'),
        ),
        migrations.AddField(
            model_name='note',
            name='music_title',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='note',
            name='music_artist',
            field=models.CharField(blank=True, default='', max_length=60),
        ),
    ]
