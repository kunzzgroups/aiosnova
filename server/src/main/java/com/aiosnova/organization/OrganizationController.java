package com.aiosnova.organization;

import com.aiosnova.auth.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/identity")
public class OrganizationController {
    private final OrganizationService service;
    private final SessionService sessions;

    public OrganizationController(OrganizationService service, SessionService sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping("/organization-companies")
    public Map<String, ?> companies(HttpServletRequest request) {
        return Map.of("items", service.companies(sessions.authenticate(request)));
    }

    @GetMapping("/organizations")
    public OrganizationService.DepartmentList departments(@RequestParam String companyId, HttpServletRequest request) {
        return service.departments(sessions.authenticate(request), companyId);
    }

    @GetMapping("/positions")
    public Map<String, ?> positions(@RequestParam String companyId, @RequestParam(required = false) LocalDate date, HttpServletRequest request) {
        return Map.of("items", service.positions(sessions.authenticate(request), companyId, date == null ? LocalDate.now(ZoneOffset.UTC) : date));
    }

    @PostMapping("/organizations")
    public ResponseEntity<OrganizationRepository.Department> createDepartment(@RequestBody Map<String, Object> input, HttpServletRequest request) {
        return ResponseEntity.status(201).body(service.createDepartment(sessions.authenticate(request), input));
    }

    @PatchMapping("/organizations/{id}")
    public OrganizationRepository.Department updateDepartment(@PathVariable String id, @RequestBody Map<String, Object> input, HttpServletRequest request) {
        return service.updateDepartment(sessions.authenticate(request), id, input);
    }

    @DeleteMapping("/organizations/{id}")
    public ResponseEntity<Void> deleteDepartment(@PathVariable String id, @RequestParam long version, HttpServletRequest request) {
        service.deleteDepartment(sessions.authenticate(request), id, version);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/positions")
    public ResponseEntity<OrganizationRepository.Position> createPosition(@RequestBody Map<String, Object> input, HttpServletRequest request) {
        return ResponseEntity.status(201).body(service.createPosition(sessions.authenticate(request), input));
    }

    @PatchMapping("/positions/{id}")
    public OrganizationRepository.Position updatePosition(@PathVariable String id, @RequestBody Map<String, Object> input, HttpServletRequest request) {
        return service.updatePosition(sessions.authenticate(request), id, input);
    }

    @DeleteMapping("/positions/{id}")
    public ResponseEntity<Void> deletePosition(@PathVariable String id, @RequestParam long version, HttpServletRequest request) {
        service.deletePosition(sessions.authenticate(request), id, version);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/organization-batches")
    public ResponseEntity<OrganizationService.BatchResult> createBatch(@RequestBody OrganizationService.Batch input, HttpServletRequest request) {
        return ResponseEntity.status(201).body(service.createBatch(sessions.authenticate(request), input));
    }

    @PostMapping("/positions/bulk-delete")
    public ResponseEntity<Void> deletePositions(@RequestBody OrganizationService.DeleteBatch input, HttpServletRequest request) {
        service.deletePositions(sessions.authenticate(request), input);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException error) {
        String message = error.getReason() == null ? error.getStatusCode().value() == 401 ? "org.sessionExpired" : "org.invalidRequest" : error.getReason();
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", message));
    }
}
