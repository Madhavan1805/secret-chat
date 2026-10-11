from django.contrib import admin
from .models import (
    CustomUser, Chat, ChatUserSetting, Message, CallHistory,
    ChatRequest, Status, StatusView, Block, PasswordResetOTP,
)

for model in (CustomUser, Chat, ChatUserSetting, Message, CallHistory,
              ChatRequest, Status, StatusView, Block, PasswordResetOTP):
    admin.site.register(model)
