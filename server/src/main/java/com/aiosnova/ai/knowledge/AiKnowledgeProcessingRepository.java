package com.aiosnova.ai.knowledge;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AiKnowledgeProcessingRepository {

    public record Job(
            String id,
            String companyId,
            String fileId,
            String status,
            int attemptCount,
            int maxAttempts) {
    }

    public record Claim(
            String jobId,
            String companyId,
            String token) {
    }

    private final JdbcTemplate jdbc;

    public java.util.List<Job> pending(String company, String merchant, int limit) {
        requireId(company,64);requireId(merchant,64);
        return jdbc.query("""
                SELECT j.id,j.company_id,j.file_id,j.status,j.attempt_count,j.max_attempts
                FROM ai_knowledge_processing_jobs j
                JOIN ai_knowledge_files f ON f.company_id=j.company_id AND f.id=j.file_id
                JOIN ai_knowledge_documents d ON d.company_id=f.company_id AND d.id=f.document_id
                JOIN ai_knowledge_bases b ON b.company_id=d.company_id AND b.id=d.knowledge_base_id
                WHERE j.company_id=? AND b.merchant_id=? AND
                ((j.status='queued' AND j.available_at<=UTC_TIMESTAMP(6)) OR
                 (j.status='running' AND j.lease_expires_at<=UTC_TIMESTAMP(6)))
                ORDER BY j.available_at,j.id LIMIT ?
                """, (r,n) -> new Job(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getInt(5),r.getInt(6)), company,merchant,Math.min(20, Math.max(1, limit)));
    }

    public boolean exhaust(String company, String id) {
        requireId(company,64); requireId(id,36);
        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs SET status='failed',claim_token=NULL,lease_expires_at=NULL,
                finished_at=UTC_TIMESTAMP(6),error_code='attempts_exhausted',error_message='File processing attempt limit reached.'
                WHERE company_id=? AND id=? AND attempt_count>=max_attempts AND
                ((status='queued' AND available_at<=UTC_TIMESTAMP(6)) OR
                 (status='running' AND lease_expires_at<=UTC_TIMESTAMP(6)))
                """,company,id)==1;
    }

    public boolean unsupported(Claim claim) {
        requireClaim(claim);
        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs SET status='unsupported',claim_token=NULL,lease_expires_at=NULL,
                finished_at=UTC_TIMESTAMP(6),error_code='unsupported_format',error_message='File stored; format is not indexed.'
                WHERE company_id=? AND id=? AND status='running' AND claim_token=? AND lease_expires_at>UTC_TIMESTAMP(6)
                """,claim.companyId(),claim.jobId(),claim.token())==1;
    }

    public boolean requeue(String company,String jobId) {
        requireId(company,64);requireId(jobId,36);
        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs SET status='queued',attempt_count=0,available_at=UTC_TIMESTAMP(6),
                claim_token=NULL,lease_expires_at=NULL,error_code=NULL,error_message=NULL,finished_at=NULL
                WHERE company_id=? AND id=? AND status IN ('failed','unsupported')
                """,company,jobId)==1;
    }

    public AiKnowledgeProcessingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String enqueue(String companyId, String fileId) {
        requireId(companyId, 64);
        requireId(fileId, 36);

        String jobId = UUID.randomUUID().toString();

        int changed = jdbc.update("""
                INSERT INTO ai_knowledge_processing_jobs
                    (id, company_id, file_id)
                SELECT ?, f.company_id, f.id
                FROM ai_knowledge_files f
                WHERE f.company_id = ? AND f.id = ?
                """,
                jobId, companyId, fileId);

        if (changed != 1) {
            throw new IllegalArgumentException(
                    "File not found in this company.");
        }

        return jobId;
    }

    public Optional<Job> find(String companyId, String jobId) {
        requireId(companyId, 64);
        requireId(jobId, 36);

        return jdbc.query("""
                SELECT id, company_id, file_id, status,
                       attempt_count, max_attempts
                FROM ai_knowledge_processing_jobs
                WHERE company_id = ? AND id = ?
                """,
                (row, number) -> new Job(
                        row.getString("id"),
                        row.getString("company_id"),
                        row.getString("file_id"),
                        row.getString("status"),
                        row.getInt("attempt_count"),
                        row.getInt("max_attempts")),
                companyId, jobId)
                .stream()
                .findFirst();
    }

    public Optional<Claim> claim(
            String companyId,
            String jobId,
            int leaseSeconds) {

        requireId(companyId, 64);
        requireId(jobId, 36);

        if (leaseSeconds < 1 || leaseSeconds > 600) {
            throw new IllegalArgumentException("Invalid lease duration.");
        }

        String token = UUID.randomUUID().toString();

        int changed = jdbc.update("""
                UPDATE ai_knowledge_processing_jobs
                SET status = 'running',
                    attempt_count = attempt_count + 1,
                    claim_token = ?,
                    lease_expires_at =
                        TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(6)),
                    started_at = UTC_TIMESTAMP(6),
                    finished_at = NULL,
                    error_code = NULL,
                    error_message = NULL
                WHERE company_id = ?
                  AND id = ?
                  AND attempt_count < max_attempts
                  AND (
                      (status = 'queued'
                       AND available_at <= UTC_TIMESTAMP(6))
                      OR
                      (status = 'running'
                       AND lease_expires_at <= UTC_TIMESTAMP(6))
                  )
                """,
                token, leaseSeconds, companyId, jobId);

        return changed == 1
                ? Optional.of(new Claim(jobId, companyId, token))
                : Optional.empty();
    }

    public boolean succeed(Claim claim) {
        requireClaim(claim);

        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs
                SET status = 'succeeded',
                    claim_token = NULL,
                    lease_expires_at = NULL,
                    finished_at = UTC_TIMESTAMP(6),
                    error_code = NULL,
                    error_message = NULL
                WHERE company_id = ?
                  AND id = ?
                  AND status = 'running'
                  AND claim_token = ?
                  AND lease_expires_at > UTC_TIMESTAMP(6)
                """,
                claim.companyId(),
                claim.jobId(),
                claim.token()) == 1;
    }

    public boolean fail(Claim claim) {
        requireClaim(claim);

        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs
                SET status = 'failed',
                    claim_token = NULL,
                    lease_expires_at = NULL,
                    finished_at = UTC_TIMESTAMP(6),
                    error_code = 'processing_failed',
                    error_message = 'File processing failed.'
                WHERE company_id = ?
                  AND id = ?
                  AND status = 'running'
                  AND claim_token = ?
                  AND lease_expires_at > UTC_TIMESTAMP(6)
                """,
                claim.companyId(),
                claim.jobId(),
                claim.token()) == 1;
    }

    public int failExhausted(String companyId) {
        requireId(companyId, 64);

        return jdbc.update("""
                UPDATE ai_knowledge_processing_jobs
                SET status = 'failed',
                    claim_token = NULL,
                    lease_expires_at = NULL,
                    finished_at = UTC_TIMESTAMP(6),
                    error_code = 'attempts_exhausted',
                    error_message = 'File processing attempt limit reached.'
                WHERE company_id = ?
                  AND attempt_count >= max_attempts
                  AND (
                      (status = 'running'
                       AND lease_expires_at <= UTC_TIMESTAMP(6))
                      OR
                      (status = 'queued'
                       AND available_at <= UTC_TIMESTAMP(6))
                  )
                """,
                companyId);
    }

    public Optional<String> findDocumentId(
            String companyId,
            String fileId) {

        requireId(companyId, 64);
        requireId(fileId, 36);

        return jdbc.query("""
                SELECT d.id
                FROM ai_knowledge_files f
                JOIN ai_knowledge_documents d
                  ON d.company_id = f.company_id
                 AND d.id = f.document_id
                WHERE f.company_id = ?
                  AND f.id = ?
                """,
                (row, number) -> row.getString("id"),
                companyId, fileId)
                .stream()
                .findFirst();
    }

    private static void requireClaim(Claim claim) {
        if (claim == null) {
            throw new IllegalArgumentException("Claim is required.");
        }

        requireId(claim.companyId(), 64);
        requireId(claim.jobId(), 36);
        requireId(claim.token(), 36);
    }

    private static void requireId(String value, int maxLength) {
        if (value == null
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid ID.");
        }
    }
}
