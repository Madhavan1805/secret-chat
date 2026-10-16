import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0015_chatusersetting_wallpaper_image_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='statusview',
            name='reaction_message',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='+', to='chat.message'),
        ),
    ]
