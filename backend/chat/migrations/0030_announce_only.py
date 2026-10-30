from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0029_birthday_away'),
    ]

    operations = [
        migrations.AddField(model_name='chat', name='announce_only', field=models.BooleanField(default=False)),
    ]
