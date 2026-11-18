from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0036_activity'),
    ]

    operations = [
        migrations.AddField(model_name='customuser', name='totp_secret', field=models.CharField(blank=True, default='', max_length=40)),
        migrations.AddField(model_name='customuser', name='totp_enabled', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='chat', name='pinned_message', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='chat.message')),
        migrations.AddField(model_name='chatusersetting', name='tone', field=models.CharField(blank=True, default='', max_length=16)),
        migrations.AddField(model_name='chatusersetting', name='call_tone', field=models.CharField(blank=True, default='', max_length=16)),
        migrations.CreateModel(
            name='Sticker',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(max_length=255, upload_to='stickers/')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stickers', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='BroadcastList',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='broadcast_lists', to=settings.AUTH_USER_MODEL)),
                ('recipients', models.ManyToManyField(blank=True, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(blank=True, default='', max_length=80)),
                ('text', models.CharField(max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='QuickReply',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('shortcut', models.CharField(max_length=20)),
                ('text', models.CharField(max_length=500)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quick_replies', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['shortcut'], 'unique_together': {('user', 'shortcut')}},
        ),
    ]
