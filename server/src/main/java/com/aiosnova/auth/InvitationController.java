package com.aiosnova.auth;

import java.security.GeneralSecurityException;
import com.google.zxing.WriterException;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

@RestController
@Profile("local")
@RequestMapping("/api/mock/invitations")
public class InvitationController {

    private final InvitationService invitationService;
    private final SessionService sessions;
    private final DirectoryService directoryService;

    public InvitationController(InvitationService invitationService, SessionService sessions, DirectoryService directoryService) {
        this.invitationService = invitationService;
        this.sessions = sessions;
        this.directoryService = directoryService;
    }

    @PostMapping
    public InvitationService.SentInvitation send(@RequestBody InvitationService.InvitationRequest request, HttpServletRequest httpRequest) {
        return invitationService.send(request, sessions.authenticate(httpRequest));
    }

    @GetMapping("/account")
    public InvitationService.Account account(@RequestParam String email) {
        return invitationService.account(email);
    }

    @GetMapping("/directory")
    public InvitationService.Directory directory(HttpServletRequest request) {
        return directoryService.directory(sessions.authenticate(request));
    }

    @PatchMapping("/users/{userId}")
    public AuthRepository.DirectoryUser update(@PathVariable String userId,
            @RequestBody DirectoryService.Profile profile, HttpServletRequest request) {
        return directoryService.update(sessions.authenticate(request), userId, profile);
    }

    @PostMapping("/{token}/mfa/start")
    public TotpService.Setup startEnrollment(@PathVariable String token) throws WriterException {
        return invitationService.startEnrollment(token);
    }

    @PostMapping("/{token}/activate")
    public InvitationService.Account activate(@PathVariable String token, @RequestBody ActivationRequest request)
            throws GeneralSecurityException {
        return invitationService.activate(token, request.code());
    }

    public record ActivationRequest(String code) {
    }

    @GetMapping("/{token}")
    public InvitationService.Invitation get(@PathVariable String token) {
        return invitationService.get(token);
    }
}
