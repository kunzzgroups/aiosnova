# Knowledge file processing: implementation and activation

## Current boundary

Implemented Java upload-to-task registration, lease/token ownership, atomic task/chunk/document publication, failure/exhaustion handling, explicit retry, local text extraction, database-backed lexical retrieval, and UI status polling. Existing Company/Merchant policy and Agent/document overrides remain authoritative. This does not replace standalone policy with Core Session authentication.

No database changes or real model calls were performed during implementation. The scheduler defaults to **off**. New code is not a claim that existing uploads have been processed.

## Processing

- Upload inserts document, original file and queued task in one transaction.
- Worker reads only configured companies in the configured Merchant.
- Claim uses a random token and a 600-second lease. Parsing happens outside the publication transaction.
- Publication first conditionally updates the task using company, token, running status and an unexpired lease. Chunk replacement and document Ready/count/timestamp happen in the same transaction. Exceptions restore previous content and task state.
- Unsupported extensions become `unsupported` task / `stored_only` document. They remain downloadable and are excluded from retrieval.
- Empty/corrupt content and parser/OCR failures become Failed; no raw exception, file text or credential is exposed.
- Failed/unsupported jobs can be manually retried via `POST /api/ai/knowledge/processing/{jobId}/retry?companyId=...`, subject to write permission. It does not reset an active claim.
- Expired tasks can be reclaimed. Exhausted tasks and their documents become Failed atomically.
- Template adoption creates fresh file processing tasks in the receiving company. It does not copy original Agent bindings or reuse original chunks.

## Formats and limits

Apache Tika 3.2.3 provides TXT/MD/CSV, DOC/DOCX, XLS/XLSX, PPT/PPTX and PDF extraction. PNG/JPEG/TIFF/BMP and text-poor PDF pages use local Tesseract through Tika. No remote OCR or AI model is called. Embedded attachments are not recursively unpacked.

Limits: existing 10 MB upload limit; extracted text capped at 2,000,000 characters; chunks up to 2,000 characters with 200-character overlap, maximum 1,000 chunks. Excess/empty output fails rather than publishing partial content as Ready. Source labels currently identify numbered sections, not exact page/cell coordinates. Tables are searchable extracted text, not reconstructed structured databases.

OCR needs a separately installed `tesseract` executable on the backend process PATH and installed language packs. `AI_KNOWLEDGE_OCR_LANGUAGES` defaults to `eng`; Chinese/English requires `chi_sim+eng` with both packs installed. Tesseract 5.5.3 and eng/chi_sim are now installed locally. Generated bilingual PNG and image-only PDF OCR passed on 2026-10-30. The PDF test verifies an empty text layer before OCR. General OCR accuracy on arbitrary customer files still requires sample acceptance. Missing OCR does not produce a false Ready status. Handwriting, complex charts, and image-only Office embedded content are not guaranteed.

## Retrieval

`POST /api/ai/knowledge/search` accepts companyId, agentId and question. It validates configured company read permission and the active Agent's Company/Merchant. SQL only selects Ready, active, indexed documents and their chunks. Inherit uses base Agent bindings; override uses explicit document bindings; an empty override grants nobody access. File/document/company relationships are joined again. Question terms use bound parameters, never SQL interpolation.

This is bounded lexical retrieval (English words and Chinese bigrams), not vector/semantic search. It selects at most 200 matching candidates and returns up to 8 chunks ranked by term overlap. Frontend places actual snippets in the existing chat context and evidence panel. Denied/failed retrieval does not fall back to metadata or other companies.

## Manual activation — not executed

1. Review existing `011_create_ai_knowledge_processing_jobs.sql` and `012_create_ai_knowledge_document_chunks.sql` installations. Do not rerun already applied migrations.
2. Back up and manually apply `013_add_knowledge_stored_only.sql` to the intended local database. It only extends the status CHECK constraint.
3. Optionally review/apply `014_enqueue_existing_knowledge_documents.sql` to enqueue older Processing documents. This writes task records, so requires explicit database approval. It does not change original IDs or bindings.
4. Install/configure local Tesseract if image/scanned PDF processing is required. Confirm available languages before activation.
5. Set `AI_KNOWLEDGE_PROCESSING_ENABLED=true` in the backend environment and restart 8081. Merely changing frontend env does not enable it.
6. Verify using actual TXT, Office, text PDF, image and scanned PDF samples. Check Ready/Failed/Stored only, company isolation, empty override, retry and restart recovery. Database concurrency and actual retrieval SQL execution require this separate integration acceptance.

No UI redesign was introduced. Processing pages quietly poll the current detail every three seconds and stop after processing ends or when leaving/switching company.

## Verification

Final Java regression: 405 tests, 0 failures/errors, 1 skipped (existing database audit check). All 10 extraction tests passed without skips, including bilingual PNG and image-only PDF. Fixed explicit OCR parser initialization and PDF page OCR context injection. Generated DOCX/XLSX/PPTX/text-PDF/TXT/CSV extraction passed. Frontend production build and Knowledge persistence, template isolation, actual text retrieval and normal chat route checks passed. No database activation was performed.

Automated tests use generated Office/PDF samples, simulated JDBC, Spring transaction proxies and intercepted HTTP. They do not connect to MySQL or a real model. Local generated-image OCR acceptance passed; database integration and representative customer-file accuracy remain explicit activation checks.

Reference: https://cwiki.apache.org/confluence/spaces/TIKA/pages/109454096/TikaOCR
