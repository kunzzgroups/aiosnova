package com.aiosnova.auth;

import java.security.GeneralSecurityException;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.google.zxing.WriterException;

@RestController
@Profile({"local", "prod"})
@RequestMapping("/api/auth/invitations")
public class InvitationActivationController {

    private final InvitationService invitationService;

    public InvitationActivationController(InvitationService invitationService) {
        this.invitationService = invitationService;
    }

    @GetMapping("/{token}")
    public ResponseEntity<InvitationService.Invitation> get(
            @PathVariable("token") String token) {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(invitationService.get(token));
    }

    @PostMapping("/{token}/mfa/start")
    public ResponseEntity<TotpService.Setup> startEnrollment(
            @PathVariable("token") String token) throws WriterException {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(invitationService.startEnrollment(token));
    }

    @PostMapping("/{token}/activate")
    public ResponseEntity<InvitationService.Account> activate(
            @PathVariable("token") String token,
            @RequestBody ActivationRequest request)
            throws GeneralSecurityException {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(invitationService.activate(token, request.code()));
    }

    public record ActivationRequest(String code) {
    }
}