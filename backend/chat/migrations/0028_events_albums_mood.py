import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0027_admin_reports'),
    ]

    operations = [
        migrations.AddField(model_name='customuser', name='mood_emoji', field=models.CharField(blank=True, default='', max_length=8)),
        migrations.AddField(model_name='customuser', name='mood_text', field=models.CharField(blank=True, default='', max_length=40)),
        migrations.AddField(model_name='customuser', name='mood_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='poll', name='event_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='poll', name='event_place', field=models.CharField(blank=True, default='', max_length=100)),
        migrations.AlterField(
            model_name='message', name='message_type',
            field=models.CharField(choices=[('text', 'Text'), ('image', 'Image'), ('video', 'Video'), ('audio', 'Audio/Voice Note'), ('document', 'Document'), ('location', 'Location'), ('system', 'System'), ('poll', 'Poll'), ('expense', 'Expense'), ('album', 'Album')], default='text', max_length=20),
        ),
        migrations.CreateModel(
            name='Album',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=60)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('purged', models.BooleanField(default=False)),
                ('message', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='album', to='chat.message')),
            ],
        ),
        migrations.CreateModel(
            name='AlbumPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.ImageField(max_length=255, upload_to='albums/')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('album', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='chat.album')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='album_photos', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['created_at', 'id']},
        ),
    ]
