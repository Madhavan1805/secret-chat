import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0032_checklist'),
    ]

    operations = [
        migrations.CreateModel(
            name='OnlineWatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('target', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='watched_by', to=settings.AUTH_USER_MODEL)),
                ('watcher', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='online_watches', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('watcher', 'target')}},
        ),
    ]
