package com.aiosnova.ai.knowledge;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="ai.knowledge.processing.enabled",havingValue="true")
public class AiKnowledgeProcessingWorker {
    private final AiKnowledgeProcessingRepository jobs;
    private final AiKnowledgeRepository files;
    private final AiKnowledgeProcessingService results;
    private final AiKnowledgeTextExtractor extractor;
    private final AiKnowledgeAccess access;
    public AiKnowledgeProcessingWorker(AiKnowledgeProcessingRepository jobs,AiKnowledgeRepository files,
            AiKnowledgeProcessingService results,AiKnowledgeTextExtractor extractor,AiKnowledgeAccess access) {
        this.jobs=jobs;this.files=files;this.results=results;this.extractor=extractor;this.access=access;
    }
    @Scheduled(fixedDelayString="${ai.knowledge.processing.interval-ms:3000}")
    public void tick() {
        for (String company:access.readableCompanies()) for (var job : jobs.pending(company,access.merchantId,5)) {
            try {
                access.read(job.companyId());
                if (job.attemptCount() >= job.maxAttempts()) { results.exhaust(job.companyId(),job.id()); continue; }
                var claim=jobs.claim(job.companyId(),job.id(),600).orElse(null);
                if (claim==null) continue;
                java.util.List<AiKnowledgeChunkRepository.Chunk> parsed;
                try {
                    parsed=extractor.extract(files.file(job.companyId(),job.fileId()));
                } catch (UnsupportedOperationException unsupported) {
                    results.unsupported(claim); continue;
                } catch (Exception failure) {
                    results.fail(claim); continue;
                }
                results.succeed(claim,parsed);
            } catch (RuntimeException failure) {
                // No raw file, credentials or exception content in logs.
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Knowledge processing deferred; job={}",job.id());
            }
        }
    }
}
