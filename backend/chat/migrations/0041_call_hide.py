from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0040_reels'),
    ]

    operations = [
        migrations.AddField(model_name='callhistory', name='caller_hidden', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='callhistory', name='receiver_hidden', field=models.BooleanField(default=False)),
    ]
