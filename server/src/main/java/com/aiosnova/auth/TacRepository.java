package com.aiosnova.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TacRepository {

    private final JdbcTemplate jdbc;

    public TacRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Challenge latest(String userId) {
        List<Challenge> rows = jdbc.query("""
                SELECT id, code_hash, created_at, expires_at, consumed_at, attempt_count, max_attempts
                FROM otp_challenges WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE
                """, (rs, row) -> new Challenge(rs.getString("id"), rs.getString("code_hash"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("consumed_at") != null, rs.getInt("attempt_count"), rs.getInt("max_attempts")), userId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void replace(String id, String userId, String hash, Instant now) {
        jdbc.update("UPDATE otp_challenges SET consumed_at = ?, version = version + 1"
                + " WHERE user_id = ? AND consumed_at IS NULL", Timestamp.from(now), userId);
        jdbc.update("INSERT INTO otp_challenges (id, user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                id, userId, hash, Timestamp.from(now), Timestamp.from(now.plusSeconds(300)));
    }

    public void failure(String id) {
        jdbc.update("UPDATE otp_challenges SET attempt_count = attempt_count + 1, version = version + 1 WHERE id = ?", id);
    }

    public void consume(String id) {
        jdbc.update("UPDATE otp_challenges SET consumed_at = UTC_TIMESTAMP(6), version = version + 1 WHERE id = ?", id);
    }

    public record Challenge(String id, String hash, Instant createdAt, Instant expiresAt,
                            boolean consumed, int attempts, int maximum) { }
}
