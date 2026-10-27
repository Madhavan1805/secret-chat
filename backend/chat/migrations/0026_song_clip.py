from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0025_time_unlock_relock'),
    ]

    operations = [
        migrations.AddField(model_name='status', name='music_start', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='status', name='music_len', field=models.PositiveIntegerField(default=30)),
        migrations.AddField(model_name='note', name='music_start', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='note', name='music_len', field=models.PositiveIntegerField(default=30)),
    ]
