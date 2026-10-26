package com.aiosnova.auth;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class DirectoryControllerTest {
    private final SessionService.Actor actor = new SessionService.Actor("user", "merchant", "active", false, false, false);

    @Test void unauthenticatedReadStopsBeforeDirectoryAccess() {
        var sessions = new SessionService(null, null, "merchant", null) {
            @Override public Actor authenticate(HttpServletRequest request) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
            }
        };
        var controller = new DirectoryController(sessions, null);
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ResponseStatusException.class,
                () -> controller.read("company", null, null)).getStatusCode());
    }

    @Test void companyAndUserScopeAreCheckedByExistingService() {
        var repository = new AuthRepository(null, null) {
            @Override public SessionService.Actor actor(String merchantId, String userId) {
                assertEquals("merchant", merchantId);
                return actor;
            }
            @Override public List<Company> accessibleCompanies(SessionService.Actor current) {
                return List.of(new Company("allowed-company", "ALLOWED", "Company", false));
            }
            @Override public List<DirectoryMembership> directoryMemberships(String merchantId, List<String> codes) {
                assertEquals("merchant", merchantId);
                assertEquals(List.of("ALLOWED"), codes);
                return List.of();
            }
            @Override public List<DirectoryUser> directoryUsers(String merchantId, List<String> ids) {
                assertEquals(List.of(), ids);
                return List.of();
            }
        };
        var sessions = new SessionService(null, null, "merchant", null) {
            @Override public Actor authenticate(HttpServletRequest request) { return actor; }
        };
        var controller = new DirectoryController(sessions, new DirectoryService(repository, null, null, null));
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> controller.read("foreign-company", null, null)).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> controller.read("", null, null)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> controller.read("allowed-company", "unrelated-user", null)).getStatusCode());
        var response = controller.read("allowed-company", null, null);
        assertEquals("private, no-store", response.getHeaders().getCacheControl());
        assertTrue(response.getBody().users().isEmpty());
    }
}
