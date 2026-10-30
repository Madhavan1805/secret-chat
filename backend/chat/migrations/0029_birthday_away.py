from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0028_events_albums_mood'),
    ]

    operations = [
        migrations.AddField(model_name='customuser', name='birthday_month', field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='customuser', name='birthday_day', field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='customuser', name='birthday_wished_on', field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name='customuser', name='auto_reply', field=models.CharField(blank=True, default='', max_length=200)),
        migrations.AddField(model_name='customuser', name='auto_reply_until', field=models.DateTimeField(blank=True, null=True)),
    ]
