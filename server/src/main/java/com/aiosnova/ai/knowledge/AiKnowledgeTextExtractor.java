package com.aiosnova.ai.knowledge;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.metadata.TikaCoreProperties;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.pdf.PDFParserConfig;
import org.apache.tika.parser.ocr.TesseractOCRConfig;
import org.apache.tika.extractor.EmbeddedDocumentExtractor;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Local parsing only. No URL fetching or model calls. */
@Component
public class AiKnowledgeTextExtractor {
    private final String languages;
    public AiKnowledgeTextExtractor(@Value("${ai.knowledge.ocr.languages:eng}") String languages) {
        this.languages = languages;
    }
    public List<AiKnowledgeChunkRepository.Chunk> extract(AiKnowledgeRepository.StoredFile file) throws Exception {
        String name = file.name().toLowerCase(Locale.ROOT);
        if (!name.matches(".*\\.(txt|md|csv|pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|tif|tiff|bmp)$")) {
            throw new UnsupportedOperationException("Unsupported file format.");
        }
        if (file.content().length == 0 || file.content().length > 10 * 1024 * 1024) throw new IllegalArgumentException("Invalid file size.");
        var context = new ParseContext();
        var ocr = new TesseractOCRConfig();
        ocr.setLanguage(languages);
        ocr.setTimeoutSeconds(60);
        context.set(TesseractOCRConfig.class, ocr);
        var ocrParser = new org.apache.tika.parser.ocr.TesseractOCRParser();
        ocrParser.initialize(java.util.Map.of());
        // PDF's page renderer resolves its OCR parser from this context.
        context.set(org.apache.tika.parser.Parser.class, ocrParser);
        var pdf = new PDFParserConfig();
        pdf.setOcrStrategy(PDFParserConfig.OCR_STRATEGY.AUTO);
        context.set(PDFParserConfig.class, pdf);
        // Never recursively unpack attachments/archives.
        context.set(EmbeddedDocumentExtractor.class, new EmbeddedDocumentExtractor() {
            public boolean shouldParseEmbedded(Metadata metadata) { return false; }
            public void parseEmbedded(java.io.InputStream input, org.xml.sax.ContentHandler handler, Metadata metadata, boolean html) { }
        });
        var metadata = new Metadata();
        metadata.set(TikaCoreProperties.RESOURCE_NAME_KEY, file.name());
        var handler = new BodyContentHandler(2_000_000);
        try (var input = new ByteArrayInputStream(file.content())) {
            if (name.matches(".*\\.(png|jpg|jpeg|tif|tiff|bmp)$")) {
                // Image metadata parsers do not necessarily invoke OCR.
                // Route standalone images directly to the local OCR parser.
                ocrParser.parse(input, handler, metadata, context);
            } else {
                new AutoDetectParser().parse(input, handler, metadata, context);
            }
        }
        String text = handler.toString().replace('\0', ' ').strip();
        if (text.isBlank()) throw new IllegalStateException("No extractable text. Check OCR runtime and languages.");
        return split(text);
    }
    static List<AiKnowledgeChunkRepository.Chunk> split(String text) {
        var result = new ArrayList<AiKnowledgeChunkRepository.Chunk>();
        for (int start = 0; start < text.length(); start += 1800) {
            String content = text.substring(start, Math.min(start + 2000, text.length())).strip();
            if (!content.isBlank()) result.add(new AiKnowledgeChunkRepository.Chunk(content, "Section " + (result.size() + 1)));
            if (result.size() > 1000) throw new IllegalArgumentException("Extracted text exceeds limit.");
        }
        return List.copyOf(result);
    }
}
