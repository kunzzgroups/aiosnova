package com.aiosnova.organization;

import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.AuthSecretService;
import com.aiosnova.auth.SessionService.Actor;
import com.aiosnova.audit.AuditChanges;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import static com.aiosnova.organization.OrganizationRepository.*;

@Service
public class OrganizationService {
    private final OrganizationRepository repository;
    private final AuthRepository auth;
    private final AuthSecretService secrets;
    private final ObjectMapper json;
    private final OrganizationAssignmentService assignments;

    public OrganizationService(OrganizationRepository repository, AuthRepository auth, AuthSecretService secrets, ObjectMapper json, OrganizationAssignmentService assignments) {
        this.repository = repository;
        this.auth = auth;
        this.secrets = secrets;
        this.json = json;
        this.assignments = assignments;
    }

    @Transactional(readOnly = true)
    public RemovalImpact removalImpact(Actor actor, String id) {
        String companyId = companyFor(actor, "organization_departments", id);
        actor = access(actor, companyId, false);
        return removalImpactInCompany(actor, companyId, id);
    }

    private HashSet<String> removalBranch(Actor actor, String companyId, String id) {
        department(actor, companyId, id);
        var ids = new HashSet<String>();
        ids.add(id);
        var all = repository.departments(actor.merchantId(), companyId);
        boolean changed = true;
        while (changed) {
            changed = false;
            for (var item : all) if (ids.contains(item.parentId()) && ids.add(item.id())) changed = true;
        }
        return ids;
    }

    private RemovalImpact removalImpactInCompany(Actor actor, String companyId, String id) {
        var branch = removalBranch(actor, companyId, id);
        var affected = repository.employeePlacements(actor.merchantId(), companyId).stream().filter(row -> branch.contains(row.get("department_id"))).toList();
        var groups = new LinkedHashMap<String, ImpactGroup>();
        for (var row : affected) {
            String key = row.get("position_id") == null ? "department:" + row.get("department_id") : (String) row.get("position_id");
            var previous = groups.get(key);
            groups.put(key, new ImpactGroup(key, (String) row.get("department_id"), (String) row.get("department_name"),
                    (String) row.get("position_id"), (String) row.get("position_name"), previous == null ? 1 : previous.employeeCount() + 1));
        }
        String snapshot = secrets.tokenHash(json.writeValueAsString(List.of(
                repository.departments(actor.merchantId(), companyId).stream().filter(d -> branch.contains(d.id())).toList(),
                repository.positions(actor.merchantId(), companyId, LocalDate.now()).stream().filter(p -> branch.contains(p.organizationId())).toList(), affected)));
        return new RemovalImpact(affected.size(), new ArrayList<>(groups.values()), snapshot, canManage(actor, companyId) && (actor.owner() || actor.manageUsers()));
    }

    @Transactional
    public void removeWithEmployees(Actor actor, String id, RemoveDepartment request) {
        String companyId = companyFor(actor, "organization_departments", id);
        actor = access(actor, companyId, true);
        version(department(actor, companyId, id).version(), request.version());
        var impact = removalImpactInCompany(actor, companyId, id);
        if (!impact.snapshot().equals(request.snapshot())) fail(HttpStatus.CONFLICT, "org.removalImpactChanged");
        if (!List.of("retain", "reassign").contains(request.mode() == null ? "" : request.mode())) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        if ("reassign".equals(request.mode()) && impact.employeeCount() > 0) {
            if (!impact.canReassign()) fail(HttpStatus.FORBIDDEN, "org.reassignmentPermissionDenied");
            var branch = removalBranch(actor, companyId, id);
            if (request.departmentId() == null || branch.contains(request.departmentId())) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
            department(actor, companyId, request.departmentId());
            var mappings = request.positionMappings();
            if (mappings == null || mappings.size() != impact.groups().size() || mappings.stream().map(PositionMapping::sourceKey).distinct().count() != mappings.size()) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
            for (var group : impact.groups()) {
                var mapping = mappings.stream().filter(item -> group.key().equals(item.sourceKey())).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "org.invalidRequest"));
                String positionId = mapping.positionId() == null ? "" : mapping.positionId();
                if (group.positionId() != null && positionId.isEmpty()) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
                if (!companyId.equals(assignments.validate(actor.merchantId(), request.departmentId(), positionId))) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
            }
            for (var row : repository.employeePlacements(actor.merchantId(), companyId)) {
                if (!branch.contains(row.get("department_id"))) continue;
                String sourceKey = row.get("position_id") == null ? "department:" + row.get("department_id") : (String) row.get("position_id");
                var mapping = mappings.stream().filter(item -> sourceKey.equals(item.sourceKey())).findFirst().orElseThrow();
                String userId = (String) row.get("user_id");
                auth.lockUser(userId);
                auth.saveCompanyPlacement(actor.merchantId(), companyId, userId, request.departmentId(), mapping.positionId());
                assignments.synchronize(actor.merchantId(), userId, actor.id());
                var before = new LinkedHashMap<String,Object>();
                before.put("departmentId", row.get("department_id")); before.put("positionId", row.get("position_id"));
                var after = new LinkedHashMap<String,Object>();
                after.put("departmentId", request.departmentId()); after.put("positionId", mapping.positionId());
                var changes = AuditChanges.between(before, after); changes.put("companyId", companyId);
                auth.audit(actor.merchantId(), actor.id(), "identity.user.reassigned", "user", userId, changes);
            }
        }
        deleteDepartment(actor, id, request.version());
    }

    public record ImpactGroup(String key, String departmentId, String departmentName, String positionId, String positionName, int employeeCount) { }
    public record RemovalImpact(int employeeCount, List<ImpactGroup> groups, String snapshot, boolean canReassign) { }
    public record PositionMapping(String sourceKey, String positionId) { }
    public record RemoveDepartment(long version, String mode, String departmentId, List<PositionMapping> positionMappings, String snapshot) { }

    @Transactional(readOnly = true)
    public List<CompanyAccess> companies(Actor actor) {
        actor = currentActor(actor);
        Actor current = actor;
        return repository.companies(actor.merchantId(), actor.id(), actor.owner()).stream().map(company -> {
            boolean manage = canManage(current, company.id());
            return new CompanyAccess(company.id(), company.code(), company.name(), manage ||
                    auth.hasCompanyPermission(current.merchantId(), company.id(), current.id(), "organization.read"), manage);
        }).toList();
    }

    @Transactional(readOnly = true)
    public DepartmentList departments(Actor actor, String companyId) {
        actor = access(actor, companyId, false);
        return new DepartmentList(repository.departments(actor.merchantId(), companyId), true, canManage(actor, companyId));
    }

    @Transactional(readOnly = true)
    public InvitationCatalog invitationCatalog(Actor actor, String companyId) {
        actor = currentActor(actor);
        if (!(actor.owner() || actor.manageUsers() || actor.canInvite())
                || auth.accessibleCompanies(actor).stream().noneMatch(company -> company.id().equals(companyId))) fail(HttpStatus.FORBIDDEN, "org.accessDenied");
        var departments = repository.departments(actor.merchantId(), companyId);
        var positions = repository.positions(actor.merchantId(), companyId, LocalDate.now());
        return new InvitationCatalog(companyId, departments.stream().filter(department -> {
            String current = department.id();
            var visited = new HashSet<String>();
            while (current != null) {
                if (!visited.add(current)) return false;
                String id = current;
                var ancestor = departments.stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
                if (ancestor == null || !"active".equals(ancestor.status())) return false;
                current = ancestor.parentId();
            }
            return true;
        }).map(department -> new InvitationDepartment(department.id(), department.name(), department.parentId(),
                positions.stream().filter(position -> department.id().equals(position.organizationId()) && "active".equals(position.status()))
                        .map(position -> new InvitationPosition(position.id(), position.name())).toList())).toList());
    }

    public record InvitationCatalog(String companyId, List<InvitationDepartment> departments) { }
    public record InvitationDepartment(String id, String name, String parentId, List<InvitationPosition> positions) { }
    public record InvitationPosition(String id, String name) { }

    @Transactional(readOnly = true)
    public List<Position> positions(Actor actor, String companyId, LocalDate date) {
        access(actor, companyId, false);
        return repository.positions(actor.merchantId(), companyId, date);
    }

    @Transactional
    public Department createDepartment(Actor actor, Map<String, Object> input) {
        String companyId = text(input, "companyId", null);
        actor = access(actor, companyId, true);
        return saveDepartment(actor, companyId, null, input);
    }

    @Transactional
    public Position createPosition(Actor actor, Map<String, Object> input) {
        String companyId = text(input, "companyId", null);
        actor = access(actor, companyId, true);
        return savePosition(actor, companyId, null, input);
    }

    @Transactional
    public Department updateDepartment(Actor actor, String id, Map<String, Object> input) {
        String companyId = companyFor(actor, "organization_departments", id);
        actor = access(actor, companyId, true);
        return saveDepartment(actor, companyId, id, input);
    }

    @Transactional
    public Position updatePosition(Actor actor, String id, Map<String, Object> input) {
        String companyId = companyFor(actor, "organization_positions", id);
        actor = access(actor, companyId, true);
        return savePosition(actor, companyId, id, input);
    }

    @Transactional
    public BatchResult createBatch(Actor actor, Batch request) {
        actor = access(actor, request.companyId(), true);
        try {
            if (request.requestId() == null || !UUID.fromString(request.requestId()).toString().equals(request.requestId())) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        } catch (IllegalArgumentException invalid) { fail(HttpStatus.BAD_REQUEST, "org.invalidRequest"); }
        String hash = secrets.tokenHash(json.writer(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsString(request));
        var completed = repository.completedBatch(actor.merchantId(), request.companyId(), actor.id(), request.requestId());
        if (completed != null) {
            if (!completed.requestHash().equals(hash)) fail(HttpStatus.CONFLICT, "org.batchRequestChanged");
            return new BatchResult(repository.departments(actor.merchantId(), request.companyId()),
                    repository.positions(actor.merchantId(), request.companyId(), LocalDate.now()), completed.departmentIds(), completed.positionIds());
        }
        if ((request.departments() == null || request.departments().isEmpty())
                && (request.positions() == null || request.positions().isEmpty())) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        List<Department> departments = new ArrayList<>();
        List<Position> positions = new ArrayList<>();
        if (request.departments() != null) for (var input : request.departments()) departments.add(saveDepartment(actor, request.companyId(), null, input));
        if (request.positions() != null) for (var input : request.positions()) positions.add(savePosition(actor, request.companyId(), null, input));
        List<String> departmentIds = departments.stream().map(Department::id).toList();
        List<String> positionIds = positions.stream().map(Position::id).toList();
        repository.completeBatch(actor.merchantId(), request.companyId(), actor.id(), request.requestId(), hash, departmentIds, positionIds);
        return new BatchResult(repository.departments(actor.merchantId(), request.companyId()),
                repository.positions(actor.merchantId(), request.companyId(), LocalDate.now()),
                departmentIds, positionIds);
    }

    @Transactional
    public void deleteDepartment(Actor actor, String id, long version) {
        String companyId = companyFor(actor, "organization_departments", id);
        actor = access(actor, companyId, true);
        Department target = department(actor, companyId, id);
        version(target.version(), version);
        List<Department> allDepartments = repository.departments(actor.merchantId(), companyId);
        List<Department> branch = new ArrayList<>();
        branch.add(target);
        HashSet<String> branchIds = new HashSet<>();
        branchIds.add(id);
        for (int index = 0; index < branch.size(); index++) {
            String parentId = branch.get(index).id();
            for (Department child : allDepartments) {
                if (parentId.equals(child.parentId()) && branchIds.add(child.id())) branch.add(child);
            }
        }
        List<Position> positions = repository.positions(actor.merchantId(), companyId, LocalDate.now()).stream()
                .filter(position -> branchIds.contains(position.organizationId())).toList();
        if (positions.stream().anyMatch(position -> allDepartments.stream().anyMatch(department -> !branchIds.contains(department.id()) && position.id().equals(department.managerPositionId())))) {
            fail(HttpStatus.CONFLICT, "org.hasDependencies");
        }
        for (Position position : positions) deletePositionInCompany(actor, companyId, position.id(), position.version(), false);
        for (int index = branch.size() - 1; index >= 0; index--) {
            Department department = branch.get(index);
            if (repository.delete("organization_departments", actor.merchantId(), companyId, department.id(), department.version(), actor.id()) != 1) fail(HttpStatus.CONFLICT, "org.versionConflict");
            auth.audit(actor.merchantId(), actor.id(), "identity.department.deleted", "department", department.id(), AuditChanges.between(Map.of("deleted", false), Map.of("deleted", true)));
        }
    }

    @Transactional
    public void deletePosition(Actor actor, String id, long version) {
        String companyId = companyFor(actor, "organization_positions", id);
        actor = access(actor, companyId, true);
        deletePositionInCompany(actor, companyId, id, version, true);
    }

    @Transactional
    public void deletePositions(Actor actor, DeleteBatch request) {
        actor = access(actor, request.companyId(), true);
        if (request.items() == null || request.items().isEmpty()
                || request.items().stream().map(DeleteItem::id).distinct().count() != request.items().size()) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        for (DeleteItem item : request.items()) deletePositionInCompany(actor, request.companyId(), item.id(), item.version(), true);
    }

    private void deletePositionInCompany(Actor actor, String companyId, String id, long expected, boolean inactiveOnly) {
        Position target = position(actor, companyId, id);
        version(target.version(), expected);
        if (inactiveOnly && !"inactive".equals(target.status())) fail(HttpStatus.CONFLICT, "org.inactiveRequired");
        if (repository.departments(actor.merchantId(), companyId).stream().anyMatch(d -> id.equals(d.managerPositionId()))) {
            fail(HttpStatus.CONFLICT, "org.hasDependencies");
        }
        if (repository.delete("organization_positions", actor.merchantId(), companyId, id, expected, actor.id()) != 1) fail(HttpStatus.CONFLICT, "org.versionConflict");
        auth.audit(actor.merchantId(), actor.id(), "identity.position.deleted", "position", id, AuditChanges.between(Map.of("deleted", false), Map.of("deleted", true)));
    }

    private Department saveDepartment(Actor actor, String companyId, String id, Map<String, Object> input) {
        if (input == null) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        Department old = id == null ? null : department(actor, companyId, id);
        if (old != null) version(old.version(), expectedVersion(input));
        String name = name(input, old == null ? null : old.name());
        String parent = text(input, "parentId", old == null ? null : old.parentId());
        String executive = text(input, "managerPositionId", old == null ? null : old.managerPositionId());
        String status = status(input, old == null ? "active" : old.status());
        if (parent != null && executive != null) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
        if (parent != null) {
            HashSet<String> ancestors = new HashSet<>();
            String current = parent;
            while (current != null) {
                if (current.equals(id) || !ancestors.add(current)) fail(HttpStatus.CONFLICT, "org.hierarchyCycle");
                current = department(actor, companyId, current).parentId();
            }
        }
        if (executive != null && !"executive".equals(position(actor, companyId, executive).level())) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
        if (repository.departmentNameExists(actor.merchantId(), companyId, parent, name, id)) fail(HttpStatus.CONFLICT, "org.departmentNameExists");
        String newId = old == null ? UUID.randomUUID().toString() : id;
        Department result = new Department(newId, actor.merchantId(), companyId, parent, executive,
                name, "department", status, old == null ? 0 : old.sortOrder(), old == null ? 0 : old.version());
        if (old == null) repository.createDepartment(result, actor.id());
        else if (repository.updateDepartment(result, actor.id()) != 1) fail(HttpStatus.CONFLICT, "org.versionConflict");
        auth.audit(actor.merchantId(), actor.id(), old == null ? "identity.department.created" : "identity.department.updated", "department", newId,
                AuditChanges.between(old == null ? Map.of() : auditFields(old), auditFields(result)));
        return department(actor, companyId, newId);
    }

    private Position savePosition(Actor actor, String companyId, String id, Map<String, Object> input) {
        if (input == null) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        Position old = id == null ? null : position(actor, companyId, id);
        if (old != null) version(old.version(), expectedVersion(input));
        String name = name(input, old == null ? null : old.name());
        String departmentId = text(input, "organizationId", old == null ? null : old.organizationId());
        if (old != null && !java.util.Objects.equals(departmentId, old.organizationId())
                && (old.assignmentCount() > 0 || repository.placementReferenced(actor.merchantId(), id))) fail(HttpStatus.CONFLICT, "org.hasDependencies");
        String level = text(input, "level", old == null ? null : old.level());
        if (departmentId == null ? !"executive".equals(level) : !List.of("manager", "staff").contains(level == null ? "" : level)) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
        if (departmentId != null) {
            if (old == null || !departmentId.equals(old.organizationId())) {
                String current = departmentId;
                HashSet<String> ancestors = new HashSet<>();
                while (current != null) {
                    if (!ancestors.add(current)) fail(HttpStatus.CONFLICT, "org.hierarchyCycle");
                    Department department = department(actor, companyId, current);
                    if (!"active".equals(department.status())) fail(HttpStatus.CONFLICT, "org.departmentInactive");
                    current = department.parentId();
                }
            } else department(actor, companyId, departmentId);
        }
        if (old != null && departmentId != null && repository.departments(actor.merchantId(), companyId).stream().anyMatch(d -> id.equals(d.managerPositionId()))) fail(HttpStatus.CONFLICT, "org.hasDependencies");
        if (repository.positionNameExists(actor.merchantId(), companyId, departmentId, name, id)) fail(HttpStatus.CONFLICT, "org.positionNameExists");
        String newId = old == null ? UUID.randomUUID().toString() : id;
        Position result = new Position(newId, actor.merchantId(), companyId, departmentId, name,
                level, status(input, old == null ? "active" : old.status()), old == null ? 0 : old.version(), 0, 0);
        if (old == null) repository.createPosition(result, actor.id());
        else if (repository.updatePosition(result, actor.id()) != 1) fail(HttpStatus.CONFLICT, "org.versionConflict");
        if (input.containsKey("managedDepartmentIds")) {
            Object value = input.get("managedDepartmentIds");
            if (!(value instanceof List<?>)) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
            List<?> managed = (List<?>) value;
            if (departmentId != null && !managed.isEmpty()) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
            for (Object selected : managed) {
                if (!(selected instanceof String)) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
                if (department(actor, companyId, (String) selected).parentId() != null) fail(HttpStatus.BAD_REQUEST, "org.invalidPlacement");
            }
            for (Department d : repository.departments(actor.merchantId(), companyId)) {
                if (managed.contains(d.id()) || newId.equals(d.managerPositionId())) {
                    Object versions = input.get("managedDepartmentVersions");
                    if (!(versions instanceof Map<?, ?>)) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
                    Object expected = ((Map<?, ?>) versions).get(d.id());
                    if (!(expected instanceof Number) || ((Number) expected).longValue() < 0) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
                    version(d.version(), ((Number) expected).longValue());
                    Department updated = new Department(d.id(), d.merchantId(), d.companyId(), d.parentId(), managed.contains(d.id()) ? newId : null,
                            d.name(), d.type(), d.status(), d.sortOrder(), d.version());
                    if (repository.updateDepartment(updated, actor.id()) != 1) fail(HttpStatus.CONFLICT, "org.versionConflict");
                    auth.audit(actor.merchantId(), actor.id(), "identity.department.updated", "department", d.id(), AuditChanges.between(auditFields(d), auditFields(updated)));
                }
            }
        }
        auth.audit(actor.merchantId(), actor.id(), old == null ? "identity.position.created" : "identity.position.updated", "position", newId,
                AuditChanges.between(old == null ? Map.of() : auditFields(old), auditFields(result)));
        return position(actor, companyId, newId);
    }

    private Map<String, Object> auditFields(Department department) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("companyId", department.companyId());
        fields.put("name", department.name());
        fields.put("status", department.status());
        fields.put("parentId", department.parentId());
        fields.put("executivePositionId", department.managerPositionId());
        return fields;
    }

    private Map<String, Object> auditFields(Position position) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("companyId", position.companyId());
        fields.put("name", position.name());
        fields.put("status", position.status());
        fields.put("departmentId", position.organizationId());
        fields.put("level", position.level());
        return fields;
    }

    private Actor access(Actor actor, String companyId, boolean write) {
        if (write) auth.merchantOwner(actor.merchantId());
        actor = currentActor(actor);
        if (write && !repository.lockCompany(actor.merchantId(), companyId)) fail(HttpStatus.FORBIDDEN, "org.accessDenied");
        if (repository.companies(actor.merchantId(), actor.id(), actor.owner()).stream().noneMatch(c -> c.id().equals(companyId))) fail(HttpStatus.FORBIDDEN, "org.accessDenied");
        boolean manage = canManage(actor, companyId);
        if (write ? !manage : !(manage || auth.hasCompanyPermission(actor.merchantId(), companyId, actor.id(), "organization.read"))) fail(HttpStatus.FORBIDDEN, "org.permissionDenied");
        return actor;
    }

    private Actor currentActor(Actor actor) {
        actor = auth.actor(actor.merchantId(), actor.id());
        if (actor == null || !"active".equals(actor.status())) fail(HttpStatus.UNAUTHORIZED, "org.sessionExpired");
        return actor;
    }

    private boolean canManage(Actor actor, String companyId) {
        return actor.owner() || auth.hasCompanyPermission(actor.merchantId(), companyId, actor.id(), "organization.manage");
    }

    private String companyFor(Actor actor, String table, String id) {
        String companyId = repository.companyFor(table, actor.merchantId(), id);
        if (companyId == null) fail(HttpStatus.NOT_FOUND, "org.recordNotFound");
        return companyId;
    }

    private Department department(Actor actor, String companyId, String id) {
        return repository.departments(actor.merchantId(), companyId).stream().filter(d -> d.id().equals(id)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "org.recordNotFound"));
    }

    private Position position(Actor actor, String companyId, String id) {
        return repository.positions(actor.merchantId(), companyId, LocalDate.now()).stream().filter(p -> p.id().equals(id)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "org.recordNotFound"));
    }

    private String text(Map<String, Object> input, String key, String fallback) {
        if (!input.containsKey(key)) return fallback;
        Object value = input.get(key);
        if (value == null) return null;
        if (!(value instanceof String)) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        String text = ((String) value).trim();
        return text.isEmpty() ? null : text;
    }

    private String name(Map<String, Object> input, String fallback) {
        String value = text(input, "name", fallback);
        if (value == null || value.length() > 200) fail(HttpStatus.BAD_REQUEST, "org.invalidName");
        return value;
    }

    private String status(Map<String, Object> input, String fallback) {
        String value = text(input, "status", fallback);
        if (!"active".equals(value) && !"inactive".equals(value)) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        return value;
    }

    private long expectedVersion(Map<String, Object> input) {
        Object value = input.get("version");
        if (!(value instanceof Number) || ((Number) value).longValue() < 0) fail(HttpStatus.BAD_REQUEST, "org.invalidRequest");
        return ((Number) value).longValue();
    }

    private void version(long current, long expected) {
        if (current != expected) fail(HttpStatus.CONFLICT, "org.versionConflict");
    }

    private void fail(HttpStatus status, String key) { throw new ResponseStatusException(status, key); }

    public record DepartmentList(List<Department> items, boolean canRead, boolean canManage) { }
    public record CompanyAccess(String id, String code, String name, boolean canRead, boolean canManage) { }
    public record Batch(String companyId, List<Map<String, Object>> departments, List<Map<String, Object>> positions, String requestId) { }
    public record BatchResult(List<Department> departments, List<Position> positions, List<String> departmentIds, List<String> positionIds) { }
    public record DeleteItem(String id, long version) { }
    public record DeleteBatch(String companyId, List<DeleteItem> items) { }
}
