import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0024_remove_daily_add_time_lock'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveField(model_name='message', name='time_unlocked_by'),
        migrations.AddField(model_name='message', name='time_lock_relock', field=models.BooleanField(default=False)),
        migrations.CreateModel(
            name='TimeUnlock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('unlocked_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='time_unlocks', to='chat.message')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='time_unlocks', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('message', 'user')}},
        ),
    ]
