package com.aiosnova.ai.knowledge;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Normal SQL-backed Knowledge and Template operations; no Mock/seed/import dependency. */
@Service
@Transactional(rollbackFor = Exception.class)
public class AiKnowledgeService {
    private final AiKnowledgeRepository db;
    private final AiKnowledgeAccess access;
    private final ObjectMapper json = new ObjectMapper();
    private final AiKnowledgeProcessingRepository processing;
    public AiKnowledgeService(AiKnowledgeRepository db, AiKnowledgeAccess access,
            AiKnowledgeProcessingRepository processing) {
        this.db = db; this.access = access; this.processing = processing;
    }
    static Map<String,Object> map(Object... pairs) {
        var result = new LinkedHashMap<String,Object>(); for (int i=0;i<pairs.length;i+=2) result.put((String)pairs[i], pairs[i+1]); return result;
    }
    private static String s(Map<String,Object> row, String key) { return Objects.toString(row.get(key), ""); }
    private static String nowId() { return UUID.randomUUID().toString(); }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private static String iso(Object date) {
        if (date == null) return null;
        if (date instanceof java.sql.Timestamp t) return t.toLocalDateTime().toInstant(ZoneOffset.UTC).toString();
        if (date instanceof LocalDateTime t) return t.toInstant(ZoneOffset.UTC).toString();
        return date.toString();
    }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static void missing() { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found in this company."); }
    private static String id(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{1,128}")) bad("Invalid record ID."); return value; }
    private static String company(String value) { id(value); if (value.length()>64) bad("Invalid company ID."); return value; }
    private static String text(JsonNode body, String key, String fallback, int max) {
        var value = body.path(key);
        if (value.isMissingNode() || value.isNull()) { if (fallback != null) return fallback; bad("Missing " + key + "."); }
        if (!value.isString()) bad("Invalid " + key + ".");
        String result = value.asString().trim();
        if (result.length()>max || (result.isEmpty() && fallback == null)) bad("Invalid " + key + ".");
        return result;
    }
    private static String description(JsonNode body) {
        String value = text(body,"description","",65535);
        if (value.getBytes(StandardCharsets.UTF_8).length>65535) bad("Description is too long."); return value;
    }
    private static String choice(String value, String... allowed) { if (!Arrays.asList(allowed).contains(value)) bad("Invalid content kind, status or mode."); return value; }
    private List<String> ids(JsonNode values) {
        if (!values.isArray() || values.size()>1000) { bad("Expected an ID array of at most 1000 entries."); }
        var result = new ArrayList<String>(); var seen = new HashSet<String>();
        for (var value : values) { if (!value.isString()) bad("Invalid linked ID."); String key=id(value.asString()); if (!seen.add(key)) bad("Duplicate linked ID."); result.add(key); }
        return result;
    }
    private void version(Map<String,Object> row, JsonNode request) {
        if (!request.has("version")) return;
        var supplied=request.path("version");
        if (!supplied.isIntegralNumber() || !supplied.canConvertToLong() || supplied.asLong()<0) bad("Invalid version.");
        if (((Number)row.get("version")).longValue()!=supplied.asLong()) throw new ResponseStatusException(HttpStatus.CONFLICT,"This record changed. Reload before saving again.");
    }
    private Map<String,Object> base(String company, String id, boolean write) {
        company(company); id(id); if (write) access.write(company); else access.read(company);
        var row=db.find("bases",company,id,write);
        if (row==null || !access.merchantId.equals(s(row,"merchant_id"))) missing(); return row;
    }
    private Map<String,Object> content(String entity, String company, String id, boolean write) {
        var row=db.find(entity,company(company),id(id),false); if (row==null) missing();
        base(company,s(row,"knowledge_base_id"),write);
        if (write) { row=db.find(entity,company,id,true); if(row==null) missing(); } return row;
    }
    private void touch(String company, String base) { db.update("bases",company,base,map("updated_at",now())); }
    private JsonNode parse(Object value) { return value==null ? json.createArrayNode() : json.readTree(value instanceof byte[] bytes ? new String(bytes,StandardCharsets.UTF_8) : value.toString()); }
    private static List<Map<String,Object>> children(List<Map<String,Object>> rows,String base) { return rows.stream().filter(row->s(row,"knowledge_base_id").equals(base)).toList(); }

    public AiKnowledgeAccess.Permissions permissions(String company) { company(company); return access.permissions(company); }
    @Transactional(readOnly=true)
    public Map<String,Object> listBases(String company) {
        company(company); access.read(company);
        var documents=db.list("documents",company); var skills=db.list("skills",company); var sources=db.list("data-sources",company);
        var items=db.list("bases",company).stream().filter(row->access.merchantId.equals(s(row,"merchant_id")))
                .map(row->baseDto(row,children(documents,s(row,"id")),children(skills,s(row,"id")),children(sources,s(row,"id")))).toList();
        return map("items",items,"permissions",access.permissions(company));
    }
    private String display(Map<String,Object> row,String entity) {
        String status=s(row,"status");
        if (status.equals("stored_only")) return "stored_only";
        if (status.equals("failed") || status.equals("error")) return "failed";
        if (status.equals("processing") || status.equals("draft") || status.equals("disconnected")) return "processing";
        String mode=s(row,"mode"); return mode.equals("paused") || mode.equals("testing") ? mode : "ready";
    }
    private Map<String,Object> baseDto(Map<String,Object> row,List<Map<String,Object>> docs,List<Map<String,Object>> skills,List<Map<String,Object>> sources) {
        String company=s(row,"company_id"), id=s(row,"id"), kind=s(row,"kind");
        var content=kind.equals("skill") ? skills : kind.equals("data") ? sources : docs;
        var statuses=content.stream().map(item->display(item,kind)).toList();
        String status="empty";
        if (!statuses.isEmpty()) { status="ready"; for(String candidate:List.of("failed","processing","stored_only","testing","paused")) if(statuses.contains(candidate)){status=candidate;break;} }
        var agents=db.baseAgents(company,id);
        return map("id",id,"merchantId",row.get("merchant_id"),"companyId",company,"allowedCompanyIds",List.of(company),
                "name",row.get("name"),"description",row.get("description"),"category",row.get("category"),"kind",kind,
                "createdAt",iso(row.get("created_at")),"updatedAt",iso(row.get("updated_at")),"version",row.get("version"),
                "documentCount",docs.size(),"agentCount",agents.size(),"agentIds",agents,"status",status,"canPromote",access.permissions(company).canPromote());
    }
    @Transactional(readOnly=true)
    public Map<String,Object> detail(String company,String baseId) {
        var row=base(company,baseId,false);
        var docs=children(db.list("documents",company),baseId); var skills=children(db.list("skills",company),baseId); var sources=children(db.list("data-sources",company),baseId);
        var defaults=db.baseAgents(company,baseId);
        var effective=new ArrayList<Map<String,Object>>();
        for(var doc:docs) {
            boolean override="override".equals(s(doc,"assignment_mode"));
            effective.add(map("documentId",doc.get("id"),"agentIds",override ? db.documentAgents(company,s(doc,"id")) : defaults,"source",override?"document":"base"));
        }
        return map("base",baseDto(row,docs,skills,sources),"documents",docs.stream().map(this::documentDto).toList(),
                "skills",skills.stream().map(this::skillDto).toList(),"dataSources",sources.stream().map(this::sourceDto).toList(),
                "effective",effective,"baseAgentIds",defaults);
    }
    private Map<String,Object> documentDto(Map<String,Object> row) {
        return map("id",row.get("id"),"baseId",row.get("knowledge_base_id"),"title",row.get("title"),"kind",row.get("kind"),"type",row.get("document_type"),
                "status",row.get("status"),"mode",row.get("mode"),"chunkCount",row.get("chunk_count"),"sizeBytes",row.get("size_bytes"),
                "uploadedAt",iso(row.get("uploaded_at")),"lastIndexedAt",iso(row.get("last_indexed_at")),"fileUrl",row.get("file_url"),"mimeType",row.get("mime_type"),"version",row.get("version"));
    }
    private Map<String,Object> skillDto(Map<String,Object> row) { return map("id",row.get("id"),"baseId",row.get("knowledge_base_id"),"name",row.get("name"),"description",row.get("description"),
            "inputSchema",row.get("input_schema")==null ? null:parse(row.get("input_schema")),"status",row.get("status"),"mode",row.get("mode"),"updatedAt",iso(row.get("updated_at")),"version",row.get("version")); }
    private Map<String,Object> sourceDto(Map<String,Object> row) { return map("id",row.get("id"),"baseId",row.get("knowledge_base_id"),"name",row.get("name"),"kind",row.get("kind"),"config",parse(row.get("config")),
            "status",row.get("status"),"mode",row.get("mode"),"lastSyncedAt",iso(row.get("last_synced_at")),"version",row.get("version")); }
    public Map<String,Object> createBase(String company,JsonNode body) {
        company(company); access.write(company); String id=nowId();
        var agents=body.has("agentIds")?ids(body.path("agentIds")):List.<String>of(); db.validateAgents(company,agents);
        db.insert("bases",map("id",id,"company_id",company,"merchant_id",access.merchantId,"name",text(body,"name",null,255),"description",description(body),
                "category",text(body,"category","Other",100),"kind",choice(text(body,"kind","document",16),"document","skill","data"),"created_at",now(),"updated_at",now()));
        db.setBaseAgents(company,id,agents); return (Map<String,Object>)detail(company,id).get("base");
    }
    public Map<String,Object> updateBase(String company,String id,JsonNode body) {
        var row=base(company,id,true); version(row,body); var values=new LinkedHashMap<String,Object>();
        if(body.has("name"))values.put("name",text(body,"name",null,255)); if(body.has("description"))values.put("description",description(body));
        if(body.has("category"))values.put("category",text(body,"category","Other",100)); values.put("updated_at",now());
        db.update("bases",company,id,values); return (Map<String,Object>)detail(company,id).get("base");
    }
    public void deleteBase(String company,String id,JsonNode body) { var row=base(company,id,true);version(row,body); db.setBaseAgents(company,id,List.of()); db.delete("bases",company,id); }
    public void setBaseAgents(String company,String id,JsonNode body) {
        var row=base(company,id,true);version(row,body);var agents=ids(body.path("agentIds"));db.validateAgents(company,agents);db.setBaseAgents(company,id,agents);touch(company,id);
    }
    public void setDocumentAgents(String company,String id,JsonNode body) {
        var row=content("documents",company,id,true);version(row,body);
        boolean inherit=body.path("agentIds").isNull();
        var agents=inherit?List.<String>of():ids(body.path("agentIds"));db.validateAgents(company,agents);
        db.update("documents",company,id,map("assignment_mode",inherit?"inherit":"override"));db.setDocumentAgents(company,id,agents);touch(company,s(row,"knowledge_base_id"));
    }
    private void kind(Map<String,Object> base,String expected) { if(!expected.equals(s(base,"kind")))bad("Content kind does not match this knowledge base."); }
    private Map<String,Object> newDocument(String company,String base,String title,String type,String kind,boolean override) {
        String id=nowId(); var values=map("id",id,"company_id",company,"knowledge_base_id",base,"title",title,"document_type",choice(type,"policy","contract","invoice","record"),
                "kind",kind,"status",kind.equals("file")?"processing":"ready","mode","active","chunk_count",0,"size_bytes",0L,"uploaded_at",now(),"last_indexed_at",null,"file_url",null,"mime_type",null,"assignment_mode",override?"override":"inherit");
        db.insert("documents",values);return values;
    }
    public Map<String,Object> addDocument(String company,String baseId,JsonNode body,String filename,String mime,byte[] bytes) {
        var base=base(company,baseId,true);kind(base,"document");
        boolean override=body.has("agentIds")&&!body.path("agentIds").isNull();
        var agents=override?ids(body.path("agentIds")):List.<String>of();db.validateAgents(company,agents);
        if(bytes!=null && bytes.length>10*1024*1024)bad("File exceeds 10 MB.");
        var doc=newDocument(company,baseId,text(body,"title",null,512),text(body,"type","policy",16),bytes==null?"record":"file",override);
        String id=s(doc,"id");
        if(bytes!=null) {
            String file=nowId(); db.file(new AiKnowledgeRepository.StoredFile(file,company,filename,mime,bytes),id,null);
            db.update("documents",company,id,map("file_url",fileUrl(company,file),"mime_type",mime,"size_bytes",(long)bytes.length));
            processing.enqueue(company, file);
        }
        db.setDocumentAgents(company,id,agents);touch(company,baseId);return documentDto(db.find("documents",company,id,false));
    }
    private String objectJson(JsonNode body,String key,boolean optional) {
        var value=body.path(key);if(optional&&(value.isNull()||value.isMissingNode()))return null;
        if(!value.isObject()||value.toString().getBytes(StandardCharsets.UTF_8).length>1024*1024)bad("Invalid "+key+" object.");
        if(key.equals("config")) for(var property:value.properties()) {
            if(!property.getValue().isString())bad("Data Source config values must be strings.");
            if(property.getKey().matches("(?i)(password|secret|api[_-]?key|access[_-]?token|authorization)"))bad("Data Source config stores non-secret metadata only.");
        }
        return value.toString();
    }
    public Map<String,Object> addContent(String entity,String company,String baseId,JsonNode body) {
        var base=base(company,baseId,true); kind(base,entity.equals("skills")?"skill":"data");
        String id=nowId();var row=map("id",id,"company_id",company,"knowledge_base_id",baseId,"name",text(body,"name",null,255),"mode","active");
        if(entity.equals("skills"))row.putAll(map("description",description(body),"input_schema",objectJson(body,"inputSchema",true),"status","ready","updated_at",now()));
        else row.putAll(map("kind",choice(text(body,"kind",null,16),"table","api","database"),"config",objectJson(body,"config",false),"status","disconnected","last_synced_at",null));
        db.insert(entity,row);touch(company,baseId); var stored=db.find(entity,company,id,false);return entity.equals("skills")?skillDto(stored):sourceDto(stored);
    }
    public Map<String,Object> addContentWithFile(String entity,String company,String baseId,JsonNode body,String filename,String mime,byte[] bytes) {
        if(bytes!=null&&bytes.length>10*1024*1024)bad("File exceeds 10 MB.");
        var saved=addContent(entity,company,baseId,body);
        if(bytes!=null)db.contentFile(new AiKnowledgeRepository.StoredFile(nowId(),company,filename,mime,bytes),entity,s(saved,"id"));
        return saved;
    }
    public Map<String,Object> renameDocument(String company,String id,JsonNode body) {
        var row=content("documents",company,id,true);
        if(!body.hasNonNull("version")) bad("Document version is required.");
        version(row,body);
        String title=text(body,"title",null,512);
        db.update("documents",company,id,map("title",title));
        touch(company,s(row,"knowledge_base_id"));
        return documentDto(db.find("documents",company,id,false));
    }
    public void deleteContent(String entity,String company,String id,JsonNode body) {
        var row=content(entity,company,id,true);version(row,body);db.delete(entity,company,id);touch(company,s(row,"knowledge_base_id"));
    }
    public Map<String,Object> contentMode(String entity,String company,String id,JsonNode body) {
        var row=content(entity,company,id,true);version(row,body);
        var fields=map("mode",choice(text(body,"mode",null,16),"active","paused","testing"));
        if(entity.equals("skills"))fields.put("updated_at",now());db.update(entity,company,id,fields);touch(company,s(row,"knowledge_base_id"));
        var stored=db.find(entity,company,id,false);return entity.equals("documents")?documentDto(stored):entity.equals("skills")?skillDto(stored):sourceDto(stored);
    }
    private String fileUrl(String company,String file) { return "/api/ai/knowledge/files/"+file+"?companyId="+company; }
    @Transactional(readOnly=true)
    public AiKnowledgeRepository.StoredFile file(String company,String id) { company(company);access.read(company);var file=db.file(company,id(id));if(file==null)missing();return file; }

    private Map<String,Object> template(String company,String id,boolean write,boolean library) {
        company(company);access.write(company);var row=db.find("templates",null,id(id),true);if(row==null)missing();
        String owner=s(row,"owner_company_id");if(!access.permissions(owner).canRead())missing();var recipients=db.visibility(owner,id);
        boolean visible=owner.equals(company)||recipients.contains(company)
                ||library&&access.permissions(company).canOverseeTemplates()&&recipients.stream().anyMatch(recipient->!recipient.equals(owner));
        if(!visible || write&&!owner.equals(company))AiKnowledgeAccess.denied();
        if(write){row=db.find("templates",company,id,true);if(row==null)missing();}return row;
    }
    private Map<String,Object> templateDto(String company,Map<String,Object> row) {
        String owner=s(row,"owner_company_id"),id=s(row,"id");var documents=parse(row.get("documents"));var skills=parse(row.get("skills"));var sources=parse(row.get("data_sources"));
        return map("id",id,"ownerCompanyId",owner,"allowedCompanyIds",db.visibility(owner,id),"name",row.get("name"),"description",row.get("description"),"category",row.get("category"),"kind",row.get("kind"),
                "documents",documents,"skills",skills,"dataSources",sources,"itemCount",documents.size()+skills.size()+sources.size(),"version",row.get("version"),
                "canEdit",owner.equals(company)&&access.permissions(company).canWrite(),"canDelete",owner.equals(company)&&access.permissions(company).canPromote());
    }
    @Transactional(readOnly=true)
    public Map<String,Object> templates(String company,boolean library) {
        company(company);access.write(company);var items=new ArrayList<Map<String,Object>>();
        for(var row:db.list("templates",null)) {
            String owner=s(row,"owner_company_id");if(!access.permissions(owner).canRead())continue;var recipients=db.visibility(owner,s(row,"id"));
            if(owner.equals(company)||recipients.contains(company)||library&&access.permissions(company).canOverseeTemplates()&&recipients.stream().anyMatch(recipient->!recipient.equals(owner)))items.add(templateDto(company,row));
        }
        return map("items",items,"permissions",access.permissions(company));
    }
    private List<String> recipients(String owner,JsonNode body,List<String> fallback) {
        var recipients=new LinkedHashSet<>(body.has("allowedCompanyIds")?ids(body.path("allowedCompanyIds")):fallback);recipients.add(owner);access.recipients(recipients);return List.copyOf(recipients);
    }
    private String cloneFile(String owner,String file,String targetCompany,String document,String template) {
        var source=db.file(owner,id(file));if(source==null)missing();String copied=nowId();db.file(new AiKnowledgeRepository.StoredFile(copied,targetCompany,source.name(),source.mimeType(),source.content()),document,template);return copied;
    }
    private String documentFile(Map<String,Object> document) {
        String url=s(document,"file_url");if(url.isEmpty())return null;
        String prefix="/api/ai/knowledge/files/";if(!url.startsWith(prefix))throw new ResponseStatusException(HttpStatus.CONFLICT,"Document has no durable stored file. Upload it before publishing.");
        return url.substring(prefix.length()).split("\\?",2)[0];
    }
    public Map<String,Object> promote(String company,JsonNode body) {
        access.admin(company(company));String baseId=id(text(body,"baseId",null,128));var base=base(company,baseId,true);version(base,body);
        String template=nowId();var allowed=recipients(company,body,List.of(company));
        var documents=json.createArrayNode();var skills=json.createArrayNode();var sources=json.createArrayNode();
        db.insert("templates",map("id",template,"owner_company_id",company,"name",text(body,"name",s(base,"name"),255),"description",body.has("description")?description(body):base.get("description"),
                "category",text(body,"category",s(base,"category"),100),"kind",base.get("kind"),"documents","[]","skills","[]","data_sources","[]"));
        for(var row:children(db.list("documents",company),baseId)) {
            var item=json.valueToTree(map("title",row.get("title"),"type",row.get("document_type"),"kind",row.get("kind"),"mimeType",row.get("mime_type"),"sizeBytes",row.get("size_bytes"),"mode",row.get("mode")));
            String file=documentFile(row);if(file!=null)((tools.jackson.databind.node.ObjectNode)item).put("fileId",cloneFile(company,file,company,null,template));documents.add(item);
        }
        for(var row:children(db.list("skills",company),baseId))skills.add(json.valueToTree(map("name",row.get("name"),"description",row.get("description"),"inputSchema",row.get("input_schema")==null?null:parse(row.get("input_schema")),"mode",row.get("mode"),"attachmentFileIds",snapshotFiles("skills",company,s(row,"id"),template))));
        for(var row:children(db.list("data-sources",company),baseId))sources.add(json.valueToTree(map("name",row.get("name"),"kind",row.get("kind"),"config",parse(row.get("config")),"mode",row.get("mode"),"attachmentFileIds",snapshotFiles("data-sources",company,s(row,"id"),template))));
        db.update("templates",company,template,map("documents",documents.toString(),"skills",skills.toString(),"data_sources",sources.toString()));db.visibility(company,template,allowed);
        return map("templateId",template,"templateName",text(body,"name",s(base,"name"),255),"documentsCaptured",documents.size(),"skillsCaptured",skills.size(),"dataSourcesCaptured",sources.size());
    }
    public Map<String,Object> editTemplate(String company,String id,JsonNode body) {
        var row=template(company,id,true,false);version(row,body);var fields=new LinkedHashMap<String,Object>();
        if(body.has("name"))fields.put("name",text(body,"name",null,255));if(body.has("description"))fields.put("description",description(body));if(body.has("category"))fields.put("category",text(body,"category",null,100));
        fields.put("updated_at",now());db.update("templates",company,id,fields);if(body.has("allowedCompanyIds"))db.visibility(company,id,recipients(company,body,List.of(company)));
        return templateDto(company,db.find("templates",company,id,false));
    }
    public void deleteTemplate(String company,String id,JsonNode body) { access.admin(company(company));var row=template(company,id,true,false);version(row,body);db.delete("templates",company,id); }
    private JsonNode itemMode(JsonNode item) { var body=json.createObjectNode();body.put("mode",text(item,"mode","active",16));return body; }
    private List<String> snapshotFiles(String entity,String company,String id,String template) {
        return db.contentFiles(entity,company,id).stream().map(file->cloneFile(company,file,company,null,template)).toList();
    }
    private void adoptContent(String entity,String company,String baseId,String owner,JsonNode item) {
        var added=addContent(entity,company,baseId,item);String id=s(added,"id");contentMode(entity,company,id,itemMode(item));
        if(item.has("attachmentFileIds"))for(String fileId:ids(item.path("attachmentFileIds"))) {
            var file=db.file(owner,fileId);if(file==null)missing();
            db.contentFile(new AiKnowledgeRepository.StoredFile(nowId(),company,file.name(),file.mimeType(),file.content()),entity,id);
        }
    }
    public Map<String,Object> adopt(String company,JsonNode body) {
        company(company);access.write(company);var template=template(company,id(text(body,"templateId",null,128)),false,false);String owner=s(template,"owner_company_id");
        var request=json.createObjectNode();request.put("name",text(body,"baseName",s(template,"name"),255));request.put("description",s(template,"description"));request.put("category",text(body,"category",s(template,"category"),100));request.put("kind",s(template,"kind"));
        var base=createBase(company,request);String baseId=s(base,"id");
        var documents=parse(template.get("documents"));var skills=parse(template.get("skills"));var sources=parse(template.get("data_sources"));
        for(var item:documents) {
            var doc=newDocument(company,baseId,text(item,"title",null,512),text(item,"type",null,16),item.hasNonNull("fileId")?"file":text(item,"kind","record",16),false);
            String docId=s(doc,"id");var fields=map("mode",choice(text(item,"mode","active",16),"active","paused","testing"));
            if(item.hasNonNull("fileId")) { String file=cloneFile(owner,item.path("fileId").asString(),company,docId,null);var stored=db.file(company,file);fields.putAll(map("file_url",fileUrl(company,file),"size_bytes",(long)stored.content().length,"mime_type",stored.mimeType())); processing.enqueue(company,file); }
            db.update("documents",company,docId,fields);
        }
        for(var item:skills)adoptContent("skills",company,baseId,owner,item);
        for(var item:sources)adoptContent("data-sources",company,baseId,owner,item);
        touch(company,baseId);
        return map("baseId",baseId,"baseName",base.get("name"),"documentsCreated",documents.size(),"skillsCreated",skills.size(),"dataSourcesCreated",sources.size());
    }
}
