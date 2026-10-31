import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0030_announce_only'),
    ]

    operations = [
        migrations.AlterField(
            model_name='message', name='message_type',
            field=models.CharField(choices=[('text', 'Text'), ('image', 'Image'), ('video', 'Video'), ('audio', 'Audio/Voice Note'), ('document', 'Document'), ('location', 'Location'), ('system', 'System'), ('poll', 'Poll'), ('expense', 'Expense'), ('album', 'Album'), ('live', 'Live location'), ('game', 'Game')], default='text', max_length=20),
        ),
        migrations.CreateModel(
            name='LiveLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lat', models.FloatField()),
                ('lng', models.FloatField()),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('expires_at', models.DateTimeField()),
                ('stopped', models.BooleanField(default=False)),
                ('message', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='live', to='chat.message')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='live_locations', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Game',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=8)),
                ('board', models.CharField(blank=True, default='', max_length=20)),
                ('picks', models.JSONField(blank=True, default=dict)),
                ('finished', models.BooleanField(default=False)),
                ('draw', models.BooleanField(default=False)),
                ('message', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='game', to='chat.message')),
                ('opponent', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='games_joined', to=settings.AUTH_USER_MODEL)),
                ('starter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='games_started', to=settings.AUTH_USER_MODEL)),
                ('turn', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('winner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Question',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=300)),
                ('answer', models.CharField(blank=True, default='', max_length=500)),
                ('answered_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('from_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions_asked', to=settings.AUTH_USER_MODEL)),
                ('to_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
