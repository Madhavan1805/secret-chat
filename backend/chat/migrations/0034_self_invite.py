from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0033_online_watch'),
    ]

    operations = [
        migrations.AddField(model_name='chat', name='is_self', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='chat', name='invite_code', field=models.CharField(blank=True, max_length=24, null=True, unique=True)),
    ]
