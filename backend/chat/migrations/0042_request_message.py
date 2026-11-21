from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('chat', '0041_call_hidden')]

    operations = [
        migrations.AddField(model_name='chatrequest', name='message', field=models.CharField(blank=True, default='', max_length=200)),
    ]
