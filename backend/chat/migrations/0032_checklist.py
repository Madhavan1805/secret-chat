import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0031_live_games_ask'),
    ]

    operations = [
        migrations.AlterField(
            model_name='message', name='message_type',
            field=models.CharField(choices=[('text', 'Text'), ('image', 'Image'), ('video', 'Video'), ('audio', 'Audio/Voice Note'), ('document', 'Document'), ('location', 'Location'), ('system', 'System'), ('poll', 'Poll'), ('expense', 'Expense'), ('album', 'Album'), ('live', 'Live location'), ('game', 'Game'), ('checklist', 'Checklist')], default='text', max_length=20),
        ),
        migrations.CreateModel(
            name='Checklist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=80)),
                ('message', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='checklist', to='chat.message')),
            ],
        ),
        migrations.CreateModel(
            name='ChecklistItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=120)),
                ('done', models.BooleanField(default=False)),
                ('position', models.PositiveSmallIntegerField(default=0)),
                ('checklist', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='chat.checklist')),
                ('done_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['position', 'id']},
        ),
    ]
