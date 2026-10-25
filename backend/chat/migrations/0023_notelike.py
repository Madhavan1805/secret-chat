import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0022_capsule_whisper_reminder_daily_expense'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='NoteLike',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('note', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='likes', to='chat.note')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='note_likes', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('note', 'user')}},
        ),
    ]
