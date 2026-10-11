from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .auth_views import login_view, register_view, check_view, forgot_view, reset_view
from .views import (
    UserViewSet, ChatViewSet, MessageViewSet, ChatRequestViewSet,
    StatusViewSet, CallViewSet,
)

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
    path('', include(router.urls)),
]
