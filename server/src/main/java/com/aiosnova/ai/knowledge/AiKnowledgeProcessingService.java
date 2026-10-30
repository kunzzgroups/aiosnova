package com.aiosnova.ai.knowledge;

import java.util.Map;
import java.util.List;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.beans.factory.annotation.Autowired;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiKnowledgeProcessingService {

    private final AiKnowledgeProcessingRepository jobs;
    private final AiKnowledgeRepository knowledge;
    private AiKnowledgeChunkRepository chunks;

    @Autowired
    public AiKnowledgeProcessingService(AiKnowledgeProcessingRepository jobs,
            AiKnowledgeRepository knowledge, AiKnowledgeChunkRepository chunks) {
        this(jobs, knowledge);
        this.chunks = chunks;
    }

    public AiKnowledgeProcessingService(
            AiKnowledgeProcessingRepository jobs,
            AiKnowledgeRepository knowledge) {
        this.jobs = jobs;
        this.knowledge = knowledge;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean retry(String company,String jobId) {
        var job=jobs.find(company,jobId).orElse(null);
        if(job==null)return false;
        String document=jobs.findDocumentId(company,job.fileId()).orElseThrow();
        if(!jobs.requeue(company,jobId))return false;
        knowledge.update("documents",company,document,Map.of("status","processing"));
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean succeed(AiKnowledgeProcessingRepository.Claim claim,
            List<AiKnowledgeChunkRepository.Chunk> values) {
        if (claim == null || values == null || values.isEmpty()) throw new IllegalArgumentException("Non-empty processing result required.");
        if (chunks == null) throw new IllegalStateException("Chunk storage is required.");
        var job = jobs.find(claim.companyId(), claim.jobId()).orElse(null);
        if (job == null) return false;
        String document = jobs.findDocumentId(claim.companyId(), job.fileId())
                .orElseThrow(() -> new IllegalStateException("Document not found in task company."));
        if (!jobs.succeed(claim)) return false;
        chunks.replace(claim.companyId(), document, job.fileId(), values);
        knowledge.update("documents", claim.companyId(), document, Map.of(
                "status", "ready", "chunk_count", values.size(),
                "last_indexed_at", LocalDateTime.now(ZoneOffset.UTC)));
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean unsupported(AiKnowledgeProcessingRepository.Claim claim) {
        var job = jobs.find(claim.companyId(), claim.jobId()).orElse(null);
        if (job == null) return false;
        String document = jobs.findDocumentId(claim.companyId(),job.fileId()).orElseThrow();
        if (!jobs.unsupported(claim)) return false;
        knowledge.update("documents",claim.companyId(),document,Map.of("status","stored_only"));
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean exhaust(String company, String jobId) {
        var job = jobs.find(company,jobId).orElse(null);
        if (job == null) return false;
        String document = jobs.findDocumentId(company,job.fileId()).orElseThrow();
        if (!jobs.exhaust(company,jobId)) return false;
        knowledge.update("documents",company,document,Map.of("status","failed"));
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean fail(
            AiKnowledgeProcessingRepository.Claim claim) {

        if (claim == null) {
            throw new IllegalArgumentException("Claim is required.");
        }

        var job = jobs.find(claim.companyId(), claim.jobId())
                .orElse(null);

        // 不存在或不属于该公司，不执行更新。
        if (job == null) {
            return false;
        }

        String documentId = jobs.findDocumentId(
                claim.companyId(), job.fileId())
                .orElseThrow(() -> new IllegalStateException(
                        "Processing file has no document in this company."));

        // 此条件更新同时验证 running、token 和有效租约。
        // 更新成功后，数据库行锁保持到整个事务结束。
        if (!jobs.fail(claim)) {
            return false;
        }

        knowledge.update(
                "documents",
                claim.companyId(),
                documentId,
                Map.of("status", "failed"));

        return true;
    }
}
