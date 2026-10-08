package com.aiosnova.auth;

import java.security.GeneralSecurityException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final TacService tacService;
    private final OtpThrottleService otpThrottleService;
    private final InvitationService invitationService;
    private final SessionService sessions;

    public AuthController(TacService tacService, OtpThrottleService otpThrottleService,
                          InvitationService invitationService, SessionService sessions) {
        this.tacService = tacService;
        this.otpThrottleService = otpThrottleService;
        this.invitationService = invitationService;
        this.sessions = sessions;
    }

    @PostMapping("/login/tac/send")
    public ResponseEntity<TacSendResponse> sendTac(
            @RequestBody TacSendRequest request,
            HttpServletRequest httpRequest) {

        if (!invitationService.canRequestOtp(request.email())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new TacSendResponse("Complete invitation activation before requesting OTP.", 0));
        }

        int retryAfter = otpThrottleService.checkSend(
                request.email(), httpRequest.getRemoteAddr());

        if (retryAfter > 0) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", Integer.toString(retryAfter))
                    .body(new TacSendResponse(
                            "Too many OTP requests. Try again in " + retryAfter + " seconds.",
                            retryAfter));
        }

        TacService.SendResult result = tacService.send(request.email());
        if (!result.sent()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", Integer.toString(result.resendCooldown()))
                    .body(new TacSendResponse(
                            "Please wait " + result.resendCooldown()
                                    + " seconds before requesting another OTP.",
                            result.resendCooldown()));
        }

        return ResponseEntity.ok(
                new TacSendResponse("An OTP has been sent.", result.resendCooldown()));
    }

    @PostMapping("/login/tac/verify")
    @Transactional
    public ResponseEntity<?> verifyTac(@RequestBody TacVerifyRequest request, HttpServletRequest httpRequest) {
        if (!invitationService.canRequestOtp(request.email())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Complete invitation activation before signing in."));
        }
        int retryAfter = otpThrottleService.checkVerify(request.email());

        if (retryAfter > 0) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", Integer.toString(retryAfter))
                    .body(new MessageResponse(
                            "Too many verification requests. Try again in "
                                    + retryAfter + " seconds."));
        }
        TacService.VerifyResult result = tacService.verify(request.email(), request.code());
        if (result == TacService.VerifyResult.ATTEMPTS_EXCEEDED) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(new MessageResponse(
                            "Too many incorrect attempts. Request a new OTP."));
        }

        if (result == TacService.VerifyResult.EXPIRED) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new MessageResponse("OTP expired. Request a new code."));
        }

        if (result == TacService.VerifyResult.INVALID) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new MessageResponse("Incorrect OTP."));
        }

        String ticket = invitationService.loginMfaTicket(request.email());
        if (ticket != null) return ResponseEntity.ok(new MfaRequiredResponse("mfa_required", ticket));
        return sessions.issue(invitationService.account(request.email()).userId(), httpRequest);
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<SessionService.Login> verifyMfa(@RequestBody MfaVerifyRequest request, HttpServletRequest httpRequest)
            throws GeneralSecurityException {
        return sessions.issue(invitationService.verifyLoginMfa(request.mfaTicket(), request.code()).userId(), httpRequest);
    }

    @PostMapping("/refresh")
    public ResponseEntity<SessionService.Login> refresh(HttpServletRequest request) {
        return sessions.refresh(request);
    }

    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request) {
        return sessions.logout(request);
    }

    public record MfaRequiredResponse(String status, String mfaTicket) {
    }

    public record MfaVerifyRequest(String mfaTicket, String code) {
    }

public record TacVerifyRequest(String email, String code) {
}

public record MessageResponse(String message) {
}

    public record TacSendRequest(String email) {
    }

    public record TacSendResponse(String message, int resendCooldown) {
    }
}
