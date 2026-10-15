package com.aiosnova.audit;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public final class AuditChanges {
    private AuditChanges() { }

    public static Map<String, Object> between(Map<String, Object> before, Map<String, Object> after) {
        Map<String, Object> changes = new LinkedHashMap<>();
        var fields = new java.util.LinkedHashSet<>(before.keySet());
        fields.addAll(after.keySet());
        for (String field : fields) add(changes, field, before.get(field), after.get(field));
        return changes;
    }

    public static void add(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("before", before);
            value.put("after", after);
            changes.put(field, value);
        }
    }

    public static void personal(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) changes.put(field, Map.of("changed", true, "redacted", true));
    }
}
