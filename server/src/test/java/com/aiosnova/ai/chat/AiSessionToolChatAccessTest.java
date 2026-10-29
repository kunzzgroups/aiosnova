package com.aiosnova.ai.chat;

import java.util.List;

import com.aiosnova.auth.AuthRepository;
import com.aiosnova.auth.SessionService;

import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class AiSessionToolChatAccessTest {

    private SessionService.Actor actor =
            new SessionService.Actor(
                    "user-a",
                    "merchant-test",
                    "active",
                    false,
                    false,
                    false);

    private int companyReads;

    private final SessionService sessions =
            new SessionService(null, null, "merchant-test", null) {
                @Override
                public Actor authenticate(HttpServletRequest request) {
                    if (actor == null) {
                        throw new ResponseStatusException(
                                HttpStatus.UNAUTHORIZED);
                    }

                    return actor;
                }
            };

    private final AuthRepository repository =
            new AuthRepository(null, null) {
                @Override
                public List<Company> accessibleCompanies(
                        SessionService.Actor current) {

                    companyReads++;

                    assertEquals("user-a", current.id());
                    assertEquals(
                            "merchant-test",
                            current.merchantId());

                    return List.of(new Company(
                            "company-test",
                            "TEST",
                            "Test company",
                            false));
                }
            };

    private final AiToolChatAccess access =
            new AiSessionToolChatAccess(
                    sessions,
                    repository,
                    "merchant-test");

    @Test
    void authenticatedUserWithCompanyAccessGetsTrustedOwner() {
        var request = new MockHttpServletRequest();

        // 即使客户端伪造这些字段，也不应被采用。
        request.addHeader("X-User-Id", "other-user");
        request.addHeader("X-Merchant-Id", "other-merchant");

        var owner = access.requireOwner(
                request,
                "company-test");

        assertEquals("user-a", owner.userId());
        assertEquals("merchant-test", owner.merchantId());
        assertEquals(1, companyReads);
    }

    @Test
    void unauthenticatedUserIsRejectedBeforeCompanyLookup() {
        actor = null;

        var error = assertThrows(
                ResponseStatusException.class,
                () -> access.requireOwner(
                        new MockHttpServletRequest(),
                        "company-test"));

        assertEquals(401, error.getStatusCode().value());
        assertEquals(0, companyReads);
    }

    @Test
    void inaccessibleCompanyIsRejected() {
        var error = assertThrows(
                ResponseStatusException.class,
                () -> access.requireOwner(
                        new MockHttpServletRequest(),
                        "other-company"));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(1, companyReads);
    }

    @Test
    void differentMerchantIsRejectedBeforeCompanyLookup() {
        actor = new SessionService.Actor(
                "user-a",
                "other-merchant",
                "active",
                false,
                false,
                false);

        var error = assertThrows(
                ResponseStatusException.class,
                () -> access.requireOwner(
                        new MockHttpServletRequest(),
                        "company-test"));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(0, companyReads);
    }
}
