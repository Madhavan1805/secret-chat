from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0034_self_invite'),
    ]

    operations = [
        migrations.AlterField(
            model_name='game', name='opponent',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='games_joined', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='game', name='state', field=models.JSONField(blank=True, default=dict)),
    ]
