from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .auth_views import login_view, register_view, check_view, forgot_view, reset_view
from .views import (
    UserViewSet, ChatViewSet, MessageViewSet, ChatRequestViewSet,
    StatusViewSet, CallViewSet,
)
from .extras import wallpaper_view, schedule_view, scheduled_list_view, cancel_scheduled_view

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'chats', ChatViewSet, basename='chat')
router.register(r'requests', ChatRequestViewSet)
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'statuses', StatusViewSet)
router.register(r'calls', CallViewSet, basename='call')

urlpatterns = [
    path('login/', login_view, name='login'),
    path('auth/register/', register_view, name='register'),
    path('auth/check/', check_view, name='check-username'),
    path('auth/forgot/', forgot_view, name='forgot-password'),
    path('auth/reset/', reset_view, name='reset-password'),

    # new (must stay ABOVE the router include)
    path('chats/wallpaper/', wallpaper_view, name='chat-wallpaper'),
    path('messages/schedule/', schedule_view, name='message-schedule'),
    path('messages/scheduled/', scheduled_list_view, name='message-scheduled'),
    path('messages/cancel_scheduled/', cancel_scheduled_view, name='message-cancel-scheduled'),

    path('', include(router.urls)),
]