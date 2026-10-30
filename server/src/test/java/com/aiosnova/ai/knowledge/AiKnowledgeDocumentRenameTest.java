package com.aiosnova.ai.knowledge;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeDocumentRenameTest {
    static tools.jackson.databind.JsonNode body(String value){return AiKnowledgePersistenceCheck.body(value);}
    @Test void renameChangesOnlyTitleAndVersion() {
        try(var ctx=new AnnotationConfigApplicationContext(AiKnowledgePersistenceCheck.Config.class)) {
            var service=ctx.getBean(AiKnowledgeService.class);var store=ctx.getBean(AiKnowledgePersistenceCheck.Store.class);
            String base=service.createBase("company-j1",body("{\"name\":\"HR\",\"agentIds\":[\"company-j1-agent\"]}")).get("id").toString();
            var doc=service.addDocument("company-j1",base,body("{\"title\":\"Original\",\"agentIds\":[]}"),"original.png","image/png",new byte[]{1,2});
            String id=doc.get("id").toString();var old=new LinkedHashMap<>(store.find("documents","company-j1",id,false));
            var files=new LinkedHashMap<>(store.files);var links=new LinkedHashMap<>(store.links);var overrides=new LinkedHashMap<>(store.overrides);
            long version=((Number)doc.get("version")).longValue();
            var saved=service.renameDocument("company-j1",id,body("{\"title\":\"Display name\",\"version\":"+version+",\"status\":\"ready\",\"agentIds\":[\"other\"]}"));
            assertEquals("Display name",saved.get("title"));
            old.put("title","Display name");old.put("version",version+1);
            assertEquals(old,store.find("documents","company-j1",id,false));
            assertEquals(files,store.files);assertEquals(links,store.links);assertEquals(overrides,store.overrides);
        }
    }
    @Test void staleMissingVersionAndForeignCompanyAreRejected() {
        try(var ctx=new AnnotationConfigApplicationContext(AiKnowledgePersistenceCheck.Config.class)) {
            var service=ctx.getBean(AiKnowledgeService.class);var store=ctx.getBean(AiKnowledgePersistenceCheck.Store.class);
            String base=service.createBase("company-j1",body("{\"name\":\"HR\"}")).get("id").toString();
            var doc=service.addDocument("company-j1",base,body("{\"title\":\"Original\"}"),null,null,null);
            String id=doc.get("id").toString();
            var old=new LinkedHashMap<>(store.find("documents","company-j1",id,false));
            assertEquals(409,assertThrows(ResponseStatusException.class,()->service.renameDocument("company-j1",id,body("{\"title\":\"Bad\",\"version\":999}"))).getStatusCode().value());
            assertEquals(400,assertThrows(ResponseStatusException.class,()->service.renameDocument("company-j1",id,body("{\"title\":\"Bad\"}"))).getStatusCode().value());
            assertEquals(404,assertThrows(ResponseStatusException.class,()->service.renameDocument("company-j2",id,body("{\"title\":\"Bad\",\"version\":0}"))).getStatusCode().value());
            assertEquals(old,store.find("documents","company-j1",id,false));
        }
    }
}
