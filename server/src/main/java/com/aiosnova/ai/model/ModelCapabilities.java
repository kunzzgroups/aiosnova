package com.aiosnova.ai.model;

public record ModelCapabilities(
    boolean chat,
    boolean vision,
    boolean toolCalling,
    Integer contextWindow
) {}
