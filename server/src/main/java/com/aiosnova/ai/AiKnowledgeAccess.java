package com.aiosnova.ai;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Trusted server-side standalone role policy. Never takes roles from request bodies. */
@Service
public class AiKnowledgeAccess {
    private final Map<String, String> roles = new LinkedHashMap<>();
    private final String overseer;
    public final String merchantId;
    public AiKnowledgeAccess(@Value("${ai.agents.merchant-id:}") String merchant,
            @Value("${ai.knowledge.company-roles:}") String companyRoles,
            @Value("${ai.knowledge.template-overseer-company:}") String overseer) {
        this.merchantId = merchant; this.overseer = overseer;
        for (String entry : companyRoles.split(",")) {
            String[] pair = entry.trim().split("=", 2);
            if (pair.length == 2 && pair[0].matches("[A-Za-z0-9_-]{1,64}") && Set.of("admin", "editor", "viewer").contains(pair[1])) roles.put(pair[0], pair[1]);
        }
    }
    public record Permissions(boolean canRead, boolean canWrite, boolean canPromote, boolean canUseTemplates, boolean canOverseeTemplates) {}
    public Permissions permissions(String company) {
        boolean read = roles.containsKey(company), write = Set.of("admin", "editor").contains(roles.getOrDefault(company, ""));
        return new Permissions(read, write, "admin".equals(roles.get(company)), write, company.equals(overseer) && "admin".equals(roles.get(company)));
    }
    public void read(String company) { if (merchantId.isBlank() || !permissions(company).canRead()) denied(); }
    public void write(String company) { read(company); if (!permissions(company).canWrite()) denied(); }
    public void admin(String company) { read(company); if (!permissions(company).canPromote()) denied(); }
    public void recipients(Collection<String> companies) { if (!roles.keySet().containsAll(companies)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Template recipient is not an authorized company in this server scope."); }
    public static void denied() { throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission for this company or operation."); }
}
