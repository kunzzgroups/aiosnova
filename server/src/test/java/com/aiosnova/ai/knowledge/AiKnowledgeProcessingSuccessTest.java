package com.aiosnova.ai.knowledge;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeProcessingSuccessTest {
    static class State extends AiKnowledgeProcessingServiceTest.State {
        List<AiKnowledgeChunkRepository.Chunk> chunks=List.of(new AiKnowledgeChunkRepository.Chunk("old",null));
        boolean failChunks;
    }
    record Backup(Object parent,List<AiKnowledgeChunkRepository.Chunk> chunks) { }
    static class Tx extends AiKnowledgeProcessingServiceTest.Transactions {
        @Override protected boolean isExistingTransaction(Object transaction) { return TransactionSynchronizationManager.isActualTransactionActive(); }
        @Override protected void doSetRollbackOnly(DefaultTransactionStatus status) { /* Outer service propagates exceptions. */ }
        final State state;
        Tx(State state) { super(state);this.state=state; }
        @Override protected Object doGetTransaction() { return new Backup(super.doGetTransaction(),state.chunks); }
        @Override protected void doRollback(DefaultTransactionStatus status) {
            var backup=(Backup)status.getTransaction();state.chunks=backup.chunks();
            var old=(AiKnowledgeProcessingServiceTest.Snapshot)backup.parent();
            state.jobStatus=old.jobStatus();state.documentStatus=old.documentStatus();state.token=old.token();state.documentVersion=old.documentVersion();
        }
    }
    @Configuration @EnableTransactionManagement(proxyTargetClass=true)
    static class Config {
        @Bean State state() { return new State(); }
        @Bean Tx transactionManager(State state) { return new Tx(state); }
        @Bean AiKnowledgeProcessingRepository jobs(State state) {
            return new AiKnowledgeProcessingServiceTest.Jobs(state) {
                @Override public boolean succeed(Claim claim) {
                    if(!super.fail(claim))return false;
                    state.jobStatus="succeeded";return true;
                }
            };
        }
        @Bean AiKnowledgeRepository knowledge(State state) {
            return new AiKnowledgeRepository(null) {
                @Override public void update(String entity,String company,String id,Map<String,Object> values) {
                    AiKnowledgeProcessingServiceTest.requireTransaction();
                    assertEquals("company-j1",company);assertEquals("document-test",id);
                    assertEquals("succeeded",state.jobStatus);assertEquals("ready",values.get("status"));
                    assertEquals(state.chunks.size(),values.get("chunk_count"));assertNotNull(values.get("last_indexed_at"));
                    state.documentStatus="ready";state.documentVersion++;
                    if(state.failDocument)throw new IllegalStateException("Document write failed");
                }
            };
        }
        @Bean AiKnowledgeChunkRepository chunks(State state) {
            return new AiKnowledgeChunkRepository(null) {
                @Override public void replace(String company,String document,String file,List<Chunk> chunks) {
                    AiKnowledgeProcessingServiceTest.requireTransaction();
                    assertEquals("company-j1",company);assertEquals("document-test",document);assertEquals("file-test",file);
                    state.chunks=List.copyOf(chunks);
                    if(state.failChunks)throw new IllegalStateException("Chunk write failed");
                }
            };
        }
        @Bean AiKnowledgeProcessingService service(AiKnowledgeProcessingRepository jobs,AiKnowledgeRepository knowledge,AiKnowledgeChunkRepository chunks) {
            return new AiKnowledgeProcessingService(jobs,knowledge,chunks);
        }
    }
    static final List<AiKnowledgeChunkRepository.Chunk> RESULT=List.of(new AiKnowledgeChunkRepository.Chunk("parsed text","Section 1"));
    @Test void commitsTaskChunksAndReadyTogether() {
        try(var ctx=new AnnotationConfigApplicationContext(Config.class)) {
            var state=ctx.getBean(State.class);
            assertTrue(ctx.getBean(AiKnowledgeProcessingService.class).succeed(AiKnowledgeProcessingServiceTest.VALID,RESULT));
            assertEquals("succeeded",state.jobStatus);assertEquals("ready",state.documentStatus);assertEquals(RESULT,state.chunks);
            assertEquals("override",state.assignmentMode);assertEquals("agent-original",state.agentBinding);
        }
    }
    @Test void chunkOrDocumentFailureRestoresEverything() {
        for(boolean chunkFailure:List.of(true,false))try(var ctx=new AnnotationConfigApplicationContext(Config.class)) {
            var state=ctx.getBean(State.class);var old=state.chunks;
            state.failChunks=chunkFailure;state.failDocument=!chunkFailure;
            assertThrows(IllegalStateException.class,()->ctx.getBean(AiKnowledgeProcessingService.class).succeed(AiKnowledgeProcessingServiceTest.VALID,RESULT));
            assertEquals("running",state.jobStatus);assertEquals("processing",state.documentStatus);assertEquals("current-token",state.token);
            assertEquals(7,state.documentVersion);assertEquals(old,state.chunks);
        }
    }
    @Test void staleTokenAndForeignCompanyCannotSaveChunks() {
        for(String company:List.of("company-j1","company-j2"))try(var ctx=new AnnotationConfigApplicationContext(Config.class)) {
            var state=ctx.getBean(State.class);var old=state.chunks;
            assertFalse(ctx.getBean(AiKnowledgeProcessingService.class).succeed(new AiKnowledgeProcessingRepository.Claim("job-test",company,"stale-token"),RESULT));
            assertEquals(old,state.chunks);assertEquals("processing",state.documentStatus);assertEquals("running",state.jobStatus);
        }
    }
}
