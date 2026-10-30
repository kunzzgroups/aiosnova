package com.aiosnova.ai.knowledge;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AiKnowledgeProcessingWorkerTest {
    static class Jobs extends AiKnowledgeProcessingRepository {
        int attempts,claimed;
        boolean lost;
        Jobs(){super(null);}
        @Override public List<Job> pending(String company,String merchant,int limit) {
            assertEquals("company-j1",company);assertEquals("merchant-acme",merchant);
            return List.of(new Job("job","company-j1","file","queued",attempts,3));
        }
        @Override public Optional<Claim> claim(String company,String job,int seconds) {
            claimed++;return lost?Optional.empty():Optional.of(new Claim(job,company,"token"));
        }
    }
    static class Files extends AiKnowledgeRepository {
        int reads;
        Files(){super(null);}
        @Override public StoredFile file(String company,String file) {
            reads++;assertEquals("company-j1",company);
            return new StoredFile(file,company,"file.txt","text/plain",new byte[]{1});
        }
    }
    static class Results extends AiKnowledgeProcessingService {
        int success,failed,unsupported,exhausted;
        Results(){super(null,null);}
        @Override public boolean succeed(AiKnowledgeProcessingRepository.Claim claim,List<AiKnowledgeChunkRepository.Chunk> values){success++;assertEquals("parsed",values.getFirst().content());return true;}
        @Override public boolean fail(AiKnowledgeProcessingRepository.Claim claim){failed++;return true;}
        @Override public boolean unsupported(AiKnowledgeProcessingRepository.Claim claim){unsupported++;return true;}
        @Override public boolean exhaust(String company,String job){exhausted++;return true;}
    }
    void run(Jobs jobs,Files files,Results results,RuntimeException error) {
        var extractor=new AiKnowledgeTextExtractor("eng") {
            @Override public List<AiKnowledgeChunkRepository.Chunk> extract(AiKnowledgeRepository.StoredFile file) {
                if(error!=null)throw error;
                return List.of(new AiKnowledgeChunkRepository.Chunk("parsed","Section 1"));
            }
        };
        new AiKnowledgeProcessingWorker(jobs,files,results,extractor,
                new AiKnowledgeAccess("merchant-acme","company-j1=admin","company-j1")).tick();
    }
    @Test void successUsesParsedText(){var j=new Jobs();var f=new Files();var r=new Results();run(j,f,r,null);assertEquals(1,r.success);assertEquals(0,r.failed);assertEquals(1,f.reads);}
    @Test void parseFailureDoesNotPublishReady(){var r=new Results();run(new Jobs(),new Files(),r,new IllegalStateException("private upstream content"));assertEquals(1,r.failed);assertEquals(0,r.success);}
    @Test void unsupportedStoredWithoutReady(){var r=new Results();run(new Jobs(),new Files(),r,new UnsupportedOperationException());assertEquals(1,r.unsupported);assertEquals(0,r.success);}
    @Test void lostClaimDoesNotReadFile(){var j=new Jobs();j.lost=true;var f=new Files();var r=new Results();run(j,f,r,null);assertEquals(0,f.reads);assertEquals(0,r.success);}
    @Test void exhaustedDoesNotExecuteParser(){var j=new Jobs();j.attempts=3;var f=new Files();var r=new Results();run(j,f,r,null);assertEquals(1,r.exhausted);assertEquals(0,j.claimed);assertEquals(0,f.reads);}
}
