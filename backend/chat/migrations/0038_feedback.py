from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0037_ten_features'),
    ]

    operations = [
        migrations.CreateModel(
            name='Feedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(default='idea', max_length=12)),
                ('text', models.CharField(max_length=1000)),
                ('status', models.CharField(default='new', max_length=12)),
                ('reply', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('replied_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feedbacks', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
