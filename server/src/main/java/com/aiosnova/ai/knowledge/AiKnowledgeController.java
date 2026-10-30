package com.aiosnova.ai.knowledge;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.io.IOException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/ai/knowledge")
public class AiKnowledgeController {
    private final AiKnowledgeService service;
    private final ObjectMapper json = new ObjectMapper();
    public AiKnowledgeController(AiKnowledgeService service) { this.service=service; }
    private String company(JsonNode body) { return body.path("companyId").asString(""); }
    @GetMapping("/permissions") public AiKnowledgeAccess.Permissions permissions(@RequestParam String companyId) { return service.permissions(companyId); }
    @GetMapping("/bases") public Map<String,Object> bases(@RequestParam String companyId) { return service.listBases(companyId); }
    @GetMapping("/bases/{id}") public Map<String,Object> base(@RequestParam String companyId,@PathVariable String id) { return service.detail(companyId,id); }
    @PostMapping("/bases") public ResponseEntity<Map<String,Object>> create(@RequestBody JsonNode body) { return ResponseEntity.status(201).body(service.createBase(company(body),body)); }
    @PatchMapping("/bases/{id}") public Map<String,Object> edit(@PathVariable String id,@RequestBody JsonNode body) { return service.updateBase(company(body),id,body); }
    @DeleteMapping("/bases/{id}") public ResponseEntity<Void> deleteBase(@PathVariable String id,@RequestParam String companyId,@RequestParam(required=false) Long version) {
        service.deleteBase(companyId,id,version(version));return ResponseEntity.noContent().build();
    }
    @PutMapping("/bases/{id}/agents") public ResponseEntity<Void> baseAgents(@PathVariable String id,@RequestBody JsonNode body) { service.setBaseAgents(company(body),id,body);return ResponseEntity.noContent().build(); }
    @PutMapping("/documents/{id}/agents") public ResponseEntity<Void> documentAgents(@PathVariable String id,@RequestBody JsonNode body) { service.setDocumentAgents(company(body),id,body);return ResponseEntity.noContent().build(); }
    @PostMapping(value="/bases/{id}/documents",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String,Object>> document(@PathVariable String id,@RequestParam String companyId,@RequestParam String title,
            @RequestParam String type,@RequestParam(defaultValue="null") String agentIds,@RequestParam(required=false) MultipartFile file) throws IOException {
        var body=json.createObjectNode();body.put("title",title);body.put("type",type);
        try{body.set("agentIds",json.readTree(agentIds));}catch(RuntimeException invalid){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid Agent list.");}
        String name=file==null?null:Objects.requireNonNullElse(file.getOriginalFilename(),"attachment").replaceAll("[\\p{Cntrl}]", "");
        String mime=file==null?null:Objects.requireNonNullElse(file.getContentType(),"application/octet-stream");
        if(name!=null && (name.length()>512||mime.length()>255))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid attachment name or media type.");
        if(file!=null&&file.getSize()>10*1024*1024)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"File exceeds 10 MB.");
        return ResponseEntity.status(201).body(service.addDocument(companyId,id,body,name,mime,file==null?null:file.getBytes()));
    }
    @PostMapping(value="/bases/{id}/{entity:skills|data-sources}",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<Map<String,Object>> content(@PathVariable String id,@PathVariable String entity,@RequestBody JsonNode body) { return ResponseEntity.status(201).body(service.addContent(entity,company(body),id,body)); }
    @PostMapping(value="/bases/{id}/{entity:skills|data-sources}",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String,Object>> contentFile(@PathVariable String id,@PathVariable String entity,@RequestParam String payload,@RequestParam(required=false) MultipartFile file) throws IOException {
        JsonNode body;
        try{body=json.readTree(payload);}catch(RuntimeException invalid){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid content metadata.");}
        String name=file==null?null:Objects.requireNonNullElse(file.getOriginalFilename(),"attachment").replaceAll("[\\p{Cntrl}]", "");
        String mime=file==null?null:Objects.requireNonNullElse(file.getContentType(),"application/octet-stream");
        if(name!=null&&(name.length()>512||mime.length()>255))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid attachment name or media type.");
        if(file!=null&&file.getSize()>10*1024*1024)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"File exceeds 10 MB.");
        return ResponseEntity.status(201).body(service.addContentWithFile(entity,company(body),id,body,name,mime,file==null?null:file.getBytes()));
    }
    @PatchMapping("/{entity:documents|skills|data-sources}/{id}/mode") public Map<String,Object> mode(@PathVariable String entity,@PathVariable String id,@RequestBody JsonNode body) { return service.contentMode(entity,company(body),id,body); }
    @DeleteMapping("/{entity:documents|skills|data-sources}/{id}") public ResponseEntity<Void> deleteContent(@PathVariable String entity,@PathVariable String id,@RequestParam String companyId,@RequestParam(required=false) Long version) { service.deleteContent(entity,companyId,id,version(version));return ResponseEntity.noContent().build(); }
    @GetMapping("/templates") public Map<String,Object> templates(@RequestParam String companyId,@RequestParam(defaultValue="false") boolean library) { return service.templates(companyId,library); }
    @PostMapping("/templates/promote") public Map<String,Object> promote(@RequestBody JsonNode body) { return service.promote(company(body),body); }
    @PostMapping("/templates/adopt") public Map<String,Object> adopt(@RequestBody JsonNode body) { return service.adopt(company(body),body); }
    @PatchMapping("/templates/{id}") public Map<String,Object> template(@PathVariable String id,@RequestBody JsonNode body) { return service.editTemplate(company(body),id,body); }
    @DeleteMapping("/templates/{id}") public ResponseEntity<Void> deleteTemplate(@PathVariable String id,@RequestParam String companyId,@RequestParam(required=false) Long version) { service.deleteTemplate(companyId,id,version(version));return ResponseEntity.noContent().build(); }
    @GetMapping("/files/{id}") public ResponseEntity<byte[]> file(@PathVariable String id,@RequestParam String companyId) {
        var file=service.file(companyId,id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.name(),StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options","nosniff").header(HttpHeaders.CACHE_CONTROL,"no-store").body(file.content());
    }
    @PatchMapping("/documents/{id}") public Map<String,Object> renameDocument(@PathVariable String id,@RequestBody JsonNode body) {
        return service.renameDocument(company(body),id,body);
    }
    private JsonNode version(Long version) { var body=json.createObjectNode();if(version!=null)body.put("version",version);return body; }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<Map<String,String>> error(ResponseStatusException error) { return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",Objects.requireNonNullElse(error.getReason(),"Knowledge request failed."))); }
    @ExceptionHandler(MaxUploadSizeExceededException.class) public ResponseEntity<Map<String,String>> tooLarge() { return ResponseEntity.status(413).body(Map.of("message","File exceeds the upload limit (10 MB).")); }
}
