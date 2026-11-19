from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import chat.models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0039_admin_pro'),
    ]

    operations = [
        migrations.CreateModel(
            name='Reel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('video', models.FileField(max_length=255, upload_to=chat.models.reel_upload_to)),
                ('caption', models.CharField(blank=True, default='', max_length=200)),
                ('audience', models.CharField(default='friends', max_length=8)),
                ('duration', models.FloatField(default=0)),
                ('views', models.PositiveIntegerField(default=0)),
                ('hidden', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reels', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-id']},
        ),
        migrations.CreateModel(
            name='ReelLike',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='likes', to='chat.reel')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('reel', 'user')}},
        ),
        migrations.CreateModel(
            name='ReelComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='chat.reel')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['id']},
        ),
        migrations.CreateModel(
            name='ReelReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reports', to='chat.reel')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('reel', 'user')}},
        ),
    ]
