package com.aiosnova.ai.knowledge;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AiKnowledgeChunkRepository {

    public record Chunk(String content, String sourceLabel) {
    }

    private final JdbcTemplate jdbc;

    public AiKnowledgeChunkRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void replace(
            String companyId,
            String documentId,
            String fileId,
            List<Chunk> chunks) {

        requireId(companyId, 64);
        requireId(documentId, 128);
        requireId(fileId, 36);

        if (chunks == null || chunks.isEmpty() || chunks.size() > 1000) {
            throw new IllegalArgumentException(
                    "Expected between 1 and 1000 chunks.");
        }

        // 固定本次输入，先校验全部内容，再执行删除。
        var values = List.copyOf(chunks);

        for (var chunk : values) {
            if (chunk.content() == null
                    || chunk.content().isBlank()
                    || chunk.content().length() > 16000
                    || (chunk.sourceLabel() != null
                        && chunk.sourceLabel().length() > 255)) {
                throw new IllegalArgumentException("Invalid chunk.");
            }
        }

        Integer matches = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM ai_knowledge_files
                WHERE company_id = ?
                  AND id = ?
                  AND document_id = ?
                """,
                Integer.class,
                companyId, fileId, documentId);

        if (matches == null || matches != 1) {
            throw new IllegalArgumentException(
                    "File does not belong to this document and company.");
        }

        jdbc.update("""
                DELETE FROM ai_knowledge_document_chunks
                WHERE company_id = ?
                  AND document_id = ?
                  AND file_id = ?
                """,
                companyId, documentId, fileId);

        for (int index = 0; index < values.size(); index++) {
            var chunk = values.get(index);

            int changed = jdbc.update("""
                    INSERT INTO ai_knowledge_document_chunks
                        (id, company_id, document_id, file_id,
                         chunk_index, content, source_label)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    UUID.randomUUID().toString(),
                    companyId,
                    documentId,
                    fileId,
                    index,
                    chunk.content(),
                    chunk.sourceLabel());

            if (changed != 1) {
                throw new IllegalStateException(
                        "Unable to save document chunk.");
            }
        }
    }

    private static void requireId(String value, int maxLength) {
        if (value == null
                || value.length() > maxLength
                || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("Invalid ID.");
        }
    }
}