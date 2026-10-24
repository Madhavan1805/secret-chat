import chat.models
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0016_statusview_reaction_message'),
    ]

    operations = [
        # ---- privacy settings
        migrations.AddField(
            model_name='customuser',
            name='privacy_last_seen',
            field=models.CharField(choices=[('everyone', 'Everyone'), ('friends', 'Friends'), ('nobody', 'Nobody')], default='everyone', max_length=10),
        ),
        migrations.AddField(
            model_name='customuser',
            name='privacy_photo',
            field=models.CharField(choices=[('everyone', 'Everyone'), ('friends', 'Friends'), ('nobody', 'Nobody')], default='everyone', max_length=10),
        ),
        migrations.AddField(
            model_name='customuser',
            name='read_receipts',
            field=models.BooleanField(default=True),
        ),

        # ---- login devices
        migrations.CreateModel(
            name='DeviceSession',
            fields=[
                ('key', models.CharField(max_length=40, primary_key=True, serialize=False)),
                ('uid', models.CharField(default=chat.models.short_uid, max_length=12, unique=True)),
                ('device_name', models.CharField(blank=True, default='', max_length=120)),
                ('ip', models.GenericIPAddressField(blank=True, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('last_used', models.DateTimeField(default=django.utils.timezone.now)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='device_sessions', to=settings.AUTH_USER_MODEL)),
            ],
        ),

        # ---- groups: description, photo, admins
        migrations.AddField(
            model_name='chat',
            name='group_description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='chat',
            name='group_photo',
            field=models.ImageField(blank=True, null=True, upload_to='group_photos/'),
        ),
        migrations.AddField(
            model_name='chat',
            name='admins',
            field=models.ManyToManyField(blank=True, related_name='admin_of_chats', to=settings.AUTH_USER_MODEL),
        ),

        # ---- archive + timed mute
        migrations.AddField(
            model_name='chatusersetting',
            name='muted_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='chatusersetting',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),

        # ---- messages: polls, starred, status preview
        migrations.AlterField(
            model_name='message',
            name='message_type',
            field=models.CharField(choices=[('text', 'Text'), ('image', 'Image'), ('video', 'Video'), ('audio', 'Audio/Voice Note'), ('document', 'Document'), ('location', 'Location'), ('system', 'System'), ('poll', 'Poll')], default='text', max_length=20),
        ),
        migrations.AddField(
            model_name='message',
            name='starred_by',
            field=models.ManyToManyField(blank=True, related_name='starred_messages', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='message',
            name='status_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='chat.status'),
        ),
        migrations.CreateModel(
            name='Poll',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('question', models.CharField(max_length=300)),
                ('multiple', models.BooleanField(default=False)),
                ('closed', models.BooleanField(default=False)),
                ('message', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='poll', to='chat.message')),
            ],
        ),
        migrations.CreateModel(
            name='PollOption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=100)),
                ('position', models.PositiveSmallIntegerField(default=0)),
                ('poll', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='options', to='chat.poll')),
            ],
            options={'ordering': ['position', 'id']},
        ),
        migrations.CreateModel(
            name='PollVote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('option', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='votes', to='chat.polloption')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='poll_votes', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('option', 'user')}},
        ),

        # ---- muted status updates
        migrations.CreateModel(
            name='StatusMute',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('muted', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_muted_by', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_mutes', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('user', 'muted')}},
        ),
    ]
