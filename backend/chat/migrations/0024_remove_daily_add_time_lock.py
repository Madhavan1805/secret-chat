from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0023_notelike'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.DeleteModel(name='DailyAnswer'),
        migrations.AddField(model_name='message', name='time_lock', field=models.BooleanField(default=False)),
        migrations.AddField(
            model_name='message',
            name='time_unlocked_by',
            field=models.ManyToManyField(blank=True, related_name='time_unlocked', to=settings.AUTH_USER_MODEL),
        ),
    ]
