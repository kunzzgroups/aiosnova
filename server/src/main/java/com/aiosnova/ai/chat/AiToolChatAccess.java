package com.aiosnova.ai.chat;

import jakarta.servlet.http.HttpServletRequest;

interface AiToolChatAccess {

    AiToolChatOwner requireOwner(
            HttpServletRequest request,
            String companyId);
}
