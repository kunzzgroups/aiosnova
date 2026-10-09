package com.aiosnova.auth;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OtpThrottleRepository {

    private final JdbcTemplate jdbc;

    public OtpThrottleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Window lock(String key, Instant resetsAt) {
        jdbc.update("INSERT INTO otp_rate_limits (bucket_key, resets_at) VALUES (?, ?)"
                + " ON DUPLICATE KEY UPDATE bucket_key = bucket_key", key, Timestamp.from(resetsAt));
        return jdbc.queryForObject("SELECT resets_at, request_count FROM otp_rate_limits WHERE bucket_key = ? FOR UPDATE",
                (rs, row) -> new Window(rs.getTimestamp("resets_at").toInstant(), rs.getInt("request_count")), key);
    }

    public void save(String key, Instant resetsAt, int count) {
        jdbc.update("UPDATE otp_rate_limits SET resets_at = ?, request_count = ? WHERE bucket_key = ?",
                Timestamp.from(resetsAt), count, key);
    }

    public record Window(Instant resetsAt, int count) { }
}
