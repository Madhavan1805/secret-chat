from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .extras5 import (pin_message_view, twofa_status_view, twofa_setup_view, twofa_enable_view, twofa_disable_view,
                      stickers_view, sticker_delete_view, broadcasts_view, broadcast_update_view,
                      broadcast_delete_view, broadcast_send_view, announce_view, announcement_latest_view,
                      quick_replies_view, quick_reply_delete_view, tones_view, storage_view)
from .admin2 import (analytics_view, make_admin_view, verify_view, warn_view, export_users_view, group_detail_view,
                     group_rename_view, group_remove_member_view, report_context_view, admin_delete_message_view,
                     words_view, word_delete_view, log_view, maintenance_view, app_status_view)
from .admin_api import (admin_stats_view, admin_users_view, admin_ban_view, admin_unban_view,
                        admin_reports_view, admin_resolve_view, report_view,
                        admin_user_detail_view, admin_logout_view, admin_password_view, admin_photo_view,
                        admin_clear_view, admin_delete_user_view, admin_groups_view, admin_delete_group_view,
                        feedback_view, admin_feedback_view, admin_feedback_update_view)
from .extras2 import album_create_view, album_add_view, mood_view, away_view, birthdays_today_view
from .extras3 import (live_start_view, live_update_view, game_create_view, game_move_view,
                      ask_send_view, ask_inbox_view, ask_answer_view, ask_public_view,
                      checklist_create_view, checklist_toggle_view, checklist_add_view,
                      online_watch_view)
from .extras4 import (self_chat_view, invite_manage_view, invite_info_view, invite_join_view,
                      translate_view, link_preview_view, backup_view)
from .activity import activity_list_view, activity_read_view
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
    path('feedback/', feedback_view),
    path('birthdays/today/', birthdays_today_view),
    path('admin-api/feedback/', admin_feedback_view),
    path('admin-api/feedback/update/', admin_feedback_update_view),
    path('albums/create/', album_create_view),
    path('albums/add/', album_add_view),
    path('users/mood/', mood_view),
    path('users/away/', away_view),
    path('live/start/', live_start_view),
    path('live/update/', live_update_view),
    path('activity/', activity_list_view),
    path('activity/read/', activity_read_view),
    path('games/create/', game_create_view),
    path('games/move/', game_move_view),
    path('users/online-watch/', online_watch_view),
    path('chats/self/', self_chat_view),
    path('groups/invite/', invite_manage_view),
    path('groups/invite-info/', invite_info_view),
    path('groups/join/', invite_join_view),
    path('messages/translate/', translate_view),
    path('link/preview/', link_preview_view),
    path('account/backup/', backup_view),
    path('checklist/create/', checklist_create_view),
    path('checklist/toggle/', checklist_toggle_view),
    path('checklist/add/', checklist_add_view),
    path('ask/send/', ask_send_view),
    path('ask/inbox/', ask_inbox_view),
    path('ask/answer/', ask_answer_view),
    path('ask/public/', ask_public_view),
    path('chats/pin-message/', pin_message_view),
    path('account/2fa/', twofa_status_view),
    path('account/2fa/setup/', twofa_setup_view),
    path('account/2fa/enable/', twofa_enable_view),
    path('account/2fa/disable/', twofa_disable_view),
    path('stickers/', stickers_view),
    path('stickers/delete/', sticker_delete_view),
    path('broadcasts/', broadcasts_view),
    path('broadcasts/update/', broadcast_update_view),
    path('broadcasts/delete/', broadcast_delete_view),
    path('broadcasts/send/', broadcast_send_view),
    path('admin-api/announce/', announce_view),
    path('announcements/latest/', announcement_latest_view),
    path('quick-replies/', quick_replies_view),
    path('quick-replies/delete/', quick_reply_delete_view),
    path('tones/', tones_view),
    path('storage/', storage_view),
    path('admin-api/stats/', admin_stats_view),
    path('admin-api/users/', admin_users_view),
    path('admin-api/users/ban/', admin_ban_view),
    path('admin-api/users/logout/', admin_logout_view),
    path('admin-api/users/password/', admin_password_view),
    path('admin-api/users/photo/', admin_photo_view),
    path('admin-api/users/clear/', admin_clear_view),
    path('admin-api/users/delete/', admin_delete_user_view),
    path('admin-api/users/<int:user_id>/', admin_user_detail_view),
    path('admin-api/analytics/', analytics_view),
    path('admin-api/users/admin/', make_admin_view),
    path('admin-api/users/verify/', verify_view),
    path('admin-api/users/warn/', warn_view),
    path('admin-api/users/export/', export_users_view),
    path('admin-api/groups/<int:chat_id>/', group_detail_view),
    path('admin-api/groups/rename/', group_rename_view),
    path('admin-api/groups/remove-member/', group_remove_member_view),
    path('admin-api/reports/<int:report_id>/context/', report_context_view),
    path('admin-api/messages/delete/', admin_delete_message_view),
    path('admin-api/words/', words_view),
    path('admin-api/words/delete/', word_delete_view),
    path('admin-api/log/', log_view),
    path('admin-api/maintenance/', maintenance_view),
    path('app/status/', app_status_view),
    path('admin-api/groups/', admin_groups_view),
    path('admin-api/groups/delete/', admin_delete_group_view),
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