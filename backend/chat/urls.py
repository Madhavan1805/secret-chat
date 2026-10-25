from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .auth_views import login_view, register_view, check_view, forgot_view, reset_view
from .views import (
    UserViewSet, ChatViewSet, MessageViewSet, ChatRequestViewSet,
    StatusViewSet, CallViewSet,
)
from .notes import notes_view
from .extras import wallpaper_view, schedule_view, scheduled_list_view, cancel_scheduled_view
from .features import (
    privacy_view, devices_view, device_revoke_view, device_revoke_others_view, logout_view,
    star_view, starred_list_view, gallery_view,
    group_update_view, group_members_view, group_admin_view,
    poll_create_view, poll_vote_view, status_mutes_view,
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

    # new (must stay ABOVE the router include)
    path('chats/wallpaper/', wallpaper_view, name='chat-wallpaper'),
    path('messages/schedule/', schedule_view, name='message-schedule'),
    path('messages/scheduled/', scheduled_list_view, name='message-scheduled'),
    path('messages/cancel_scheduled/', cancel_scheduled_view, name='message-cancel-scheduled'),

    path('auth/logout/', logout_view, name='logout'),
    path('privacy/', privacy_view, name='privacy'),
    path('devices/', devices_view, name='devices'),
    path('devices/revoke/', device_revoke_view, name='device-revoke'),
    path('devices/revoke_others/', device_revoke_others_view, name='device-revoke-others'),
    path('messages/star/', star_view, name='message-star'),
    path('messages/starred/', starred_list_view, name='message-starred'),
    path('messages/gallery/', gallery_view, name='message-gallery'),
    path('groups/update/', group_update_view, name='group-update'),
    path('groups/members/', group_members_view, name='group-members'),
    path('groups/admins/', group_admin_view, name='group-admins'),
    path('polls/create/', poll_create_view, name='poll-create'),
    path('polls/vote/', poll_vote_view, name='poll-vote'),
    path('status-mutes/', status_mutes_view, name='status-mutes'),
    path('notes/', notes_view, name='notes'),

    path('', include(router.urls)),
]