from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('chat', '0040_reels')]

    operations = [
        migrations.AddField(model_name='callhistory', name='hidden_for_caller', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='callhistory', name='hidden_for_receiver', field=models.BooleanField(default=False)),
    ]
