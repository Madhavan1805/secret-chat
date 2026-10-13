from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('chat.urls')),

    # Media files (photo, voice, video, files) - DEBUG True/False rendulayum work aagum.
    # Railway-la MEDIA_ROOT volume path-ku point aagum.
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]