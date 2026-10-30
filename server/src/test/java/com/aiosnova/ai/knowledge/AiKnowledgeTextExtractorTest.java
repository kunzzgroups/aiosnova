package com.aiosnova.ai.knowledge;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeTextExtractorTest {
    private static java.awt.image.BufferedImage bilingualImage() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(new org.apache.tika.parser.ocr.TesseractOCRParser().hasTesseract(), "Local Tesseract required");
        var font=new java.awt.Font("Microsoft YaHei",java.awt.Font.PLAIN,52);
        assertEquals(-1,font.canDisplayUpTo("员工年假十四天"),"A Chinese-capable font is required for this OCR fixture");
        var image=new java.awt.image.BufferedImage(1400,400,java.awt.image.BufferedImage.TYPE_INT_RGB);
        var graphics=image.createGraphics();
        try {
            graphics.setColor(java.awt.Color.WHITE);graphics.fillRect(0,0,1400,400);
            graphics.setColor(java.awt.Color.BLACK);graphics.setFont(font);
            graphics.drawString("Annual leave is fourteen days",50,130);
            graphics.drawString("员工年假十四天",50,260);
        } finally { graphics.dispose(); }
        return image;
    }
    private static void assertBilingual(String name,byte[] bytes) throws Exception {
        var chunks=new AiKnowledgeTextExtractor("chi_sim+eng").extract(
                new AiKnowledgeRepository.StoredFile("file","company-j1",name,"application/octet-stream",bytes));
        String text=chunks.stream().map(AiKnowledgeChunkRepository.Chunk::content).collect(java.util.stream.Collectors.joining("\n"));
        assertTrue(text.toLowerCase(java.util.Locale.ROOT).contains("fourteen"),"English OCR text missing");
        String compact=text.replaceAll("\\s+","");
        assertTrue(compact.contains("年假"),"Chinese OCR text missing");
        assertTrue(compact.contains("十四天"),"Chinese OCR number/unit missing");
    }
    @Test void bilingualImageOcr() throws Exception {
        try(var output=new ByteArrayOutputStream()) {
            javax.imageio.ImageIO.write(bilingualImage(),"png",output);
            assertBilingual("bilingual.png",output.toByteArray());
        }
    }
    @Test void scannedPdfOcrHasNoTextLayer() throws Exception {
        try(var doc=new PDDocument();var output=new ByteArrayOutputStream()) {
            var page=new PDPage(new org.apache.pdfbox.pdmodel.common.PDRectangle(700,200));doc.addPage(page);
            var image=org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory.createFromImage(doc,bilingualImage());
            try(var content=new PDPageContentStream(doc,page)) { content.drawImage(image,0,0,700,200); }
            assertTrue(new org.apache.pdfbox.text.PDFTextStripper().getText(doc).isBlank(),"Fixture must not contain a text layer");
            doc.save(output);
            assertBilingual("scanned.pdf",output.toByteArray());
        }
    }
    final AiKnowledgeTextExtractor extractor=new AiKnowledgeTextExtractor("eng");
    void contains(String name,byte[] bytes,String expected) throws Exception {
        var chunks=extractor.extract(new AiKnowledgeRepository.StoredFile("file","company-j1",name,"application/octet-stream",bytes));
        assertTrue(chunks.stream().anyMatch(chunk->chunk.content().contains(expected)));
        assertTrue(chunks.stream().allMatch(chunk->chunk.sourceLabel()!=null && chunk.content().length()<=2000));
    }
    @Test void textAndCsv() throws Exception {
        contains("policy.txt","Annual leave is fourteen days. 年假十四天".getBytes(StandardCharsets.UTF_8),"fourteen");
        contains("table.csv","Name,Days\nAnnual,14".getBytes(StandardCharsets.UTF_8),"Annual");
    }
    @Test void word() throws Exception {
        try(var doc=new XWPFDocument();var out=new ByteArrayOutputStream()) {
            doc.createParagraph().createRun().setText("Company policy annual leave fourteen days");
            doc.write(out);contains("policy.docx",out.toByteArray(),"fourteen");
        }
    }
    @Test void spreadsheet() throws Exception {
        try(var book=new XSSFWorkbook();var out=new ByteArrayOutputStream()) {
            book.createSheet("Leave").createRow(0).createCell(0).setCellValue("Annual leave fourteen days");
            book.write(out);contains("leave.xlsx",out.toByteArray(),"fourteen");
        }
    }
    @Test void slides() throws Exception {
        try(var slides=new XMLSlideShow();var out=new ByteArrayOutputStream()) {
            slides.createSlide().createTextBox().setText("Annual leave fourteen days");
            slides.write(out);contains("policy.pptx",out.toByteArray(),"fourteen");
        }
    }
    @Test void pdf() throws Exception {
        try(var doc=new PDDocument();var out=new ByteArrayOutputStream()) {
            var page=new PDPage();doc.addPage(page);
            try(var content=new PDPageContentStream(doc,page)) {
                content.beginText();content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);
                content.newLineAtOffset(20,700);content.showText("Annual leave fourteen days");content.endText();
            }
            doc.save(out);contains("policy.pdf",out.toByteArray(),"fourteen");
        }
    }
    @Test void unsupportedAndEmptyDoNotBecomeReady() {
        assertThrows(UnsupportedOperationException.class,()->contains("unknown.zip",new byte[]{1},"x"));
        assertThrows(IllegalArgumentException.class,()->contains("empty.txt",new byte[0],"x"));
    }
    @Test void chunksAreBoundedAndOverlap() {
        String text="A".repeat(4500);
        var chunks=AiKnowledgeTextExtractor.split(text);
        assertEquals(3,chunks.size());assertEquals(2000,chunks.getFirst().content().length());
        assertThrows(IllegalArgumentException.class,()->AiKnowledgeTextExtractor.split("A".repeat(2_000_000)));
    }
    @Test void actualImageOcrWhenLocalEngineIsAvailable() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(
                new org.apache.tika.parser.ocr.TesseractOCRParser().hasTesseract(),
                "Tesseract is not installed; actual OCR acceptance requires local runtime.");
        var image=new java.awt.image.BufferedImage(1000,200,java.awt.image.BufferedImage.TYPE_INT_RGB);
        var graphics=image.createGraphics();
        try {
            graphics.setColor(java.awt.Color.WHITE);graphics.fillRect(0,0,1000,200);
            graphics.setColor(java.awt.Color.BLACK);graphics.setFont(new java.awt.Font("SansSerif",java.awt.Font.PLAIN,48));
            graphics.drawString("Annual leave fourteen days",30,100);
        } finally { graphics.dispose(); }
        try(var output=new ByteArrayOutputStream()) {
            javax.imageio.ImageIO.write(image,"png",output);
            contains("policy.png",output.toByteArray(),"fourteen");
        }
    }
}
