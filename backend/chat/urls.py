from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_api import (admin_stats_view, admin_users_view, admin_ban_view, admin_unban_view,
                        admin_reports_view, admin_resolve_view, report_view)
from .extras2 import album_create_view, album_add_view, mood_view, away_view
from .extras3 import (live_start_view, live_update_view, game_create_view, game_move_view,
                      ask_send_view, ask_inbox_view, ask_answer_view, ask_public_view,
                      checklist_create_view, checklist_toggle_view, checklist_add_view,
                      online_watch_view, export_data_view)
from .auth_views import login_view, register_view, check_view, forgot_view, reset_view
from .views import (
    UserViewSet, ChatViewSet, MessageViewSet, ChatRequestViewSet,
    StatusViewSet, CallViewSet,
)
from .notes import notes_view, note_like_view
from .music import music_search
from .plus import (
    reminder_create_view, reminder_list_view, reminder_cancel_view, time_unlock_view, time_relock_view,
    expense_create_view, expense_settle_view, expense_balances_view, reaction_rain_view,
)
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
    path('reports/', report_view),
    path('albums/create/', album_create_view),
    path('albums/add/', album_add_view),
    path('users/mood/', mood_view),
    path('users/away/', away_view),
    path('live/start/', live_start_view),
    path('live/update/', live_update_view),
    path('games/create/', game_create_view),
    path('games/move/', game_move_view),
    path('users/online-watch/', online_watch_view),
    path('account/export/', export_data_view),
    path('checklist/create/', checklist_create_view),
    path('checklist/toggle/', checklist_toggle_view),
    path('checklist/add/', checklist_add_view),
    path('ask/send/', ask_send_view),
    path('ask/inbox/', ask_inbox_view),
    path('ask/answer/', ask_answer_view),
    path('ask/public/', ask_public_view),
    path('admin-api/stats/', admin_stats_view),
    path('admin-api/users/', admin_users_view),
    path('admin-api/users/ban/', admin_ban_view),
    path('admin-api/users/unban/', admin_unban_view),
    path('admin-api/reports/', admin_reports_view),
    path('admin-api/reports/resolve/', admin_resolve_view),
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
    path('notes/like/', note_like_view, name='note-like'),
    path('messages/rain/', reaction_rain_view, name='reaction-rain'),
    path('music/search/', music_search, name='music-search'),
    path('reminders/', reminder_list_view, name='reminders'),
    path('reminders/create/', reminder_create_view, name='reminder-create'),
    path('reminders/cancel/', reminder_cancel_view, name='reminder-cancel'),
    path('messages/time_unlock/', time_unlock_view, name='time-unlock'),
    path('messages/time_relock/', time_relock_view, name='time-relock'),
    path('expenses/create/', expense_create_view, name='expense-create'),
    path('expenses/settle/', expense_settle_view, name='expense-settle'),
    path('expenses/balances/', expense_balances_view, name='expense-balances'),

    path('', include(router.urls)),
]