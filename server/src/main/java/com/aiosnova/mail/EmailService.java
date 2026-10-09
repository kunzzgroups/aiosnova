package com.aiosnova.mail;

public interface EmailService {

    void send(String to, String subject, String body);
}
