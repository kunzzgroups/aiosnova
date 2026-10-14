package com.aiosnova.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/identity/users")
public class EmployeeDeletionController {
    private final DirectoryService directory;
    private final SessionService sessions;

    public EmployeeDeletionController(DirectoryService directory, SessionService sessions) {
        this.directory = directory;
        this.sessions = sessions;
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> delete(@PathVariable String userId, HttpServletRequest request) {
        directory.delete(sessions.authenticate(request), List.of(userId));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<Void> deleteMany(@RequestBody DeleteEmployees input, HttpServletRequest request) {
        directory.delete(sessions.authenticate(request), input.userIds());
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "users.deleteSessionExpired" : error.getReason()));
    }

    public record DeleteEmployees(List<String> userIds) { }
}
