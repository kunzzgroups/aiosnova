package com.aiosnova.ai;

public record ModelCapabilities(
    boolean chat,
    boolean vision,
    boolean toolCalling,
    Integer contextWindow
) {}
