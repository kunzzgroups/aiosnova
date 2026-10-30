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
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final TacService tacService;
    private final OtpThrottleService otpThrottleService;
    private final InvitationService invitationService;
    private final SessionService sessions;
    private final DeployedTestLoginService testLogin;

    public AuthController(TacService tacService, OtpThrottleService otpThrottleService,
                          InvitationService invitationService, SessionService sessions,
                          DeployedTestLoginService testLogin) {
        this.tacService = tacService;
        this.otpThrottleService = otpThrottleService;
        this.invitationService = invitationService;
        this.sessions = sessions;
        this.testLogin = testLogin;
    }

    @PostMapping("/login/tac/send")
    public ResponseEntity<TacSendResponse> sendTac(
            @Valid @RequestBody TacSendRequest request,
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
    public ResponseEntity<?> verifyTac(@Valid @RequestBody TacVerifyRequest request, HttpServletRequest httpRequest) {
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
        var testSession = testLogin.tryLogin(request.email(), request.code(), httpRequest);
        if (testSession != null) return testSession;
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
        return sessions.issue(invitationService.account(request.email()).userId(), httpRequest, SessionService.LoginMethod.OTP);
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<SessionService.Login> verifyMfa(@Valid @RequestBody MfaVerifyRequest request, HttpServletRequest httpRequest)
            throws GeneralSecurityException {
        return sessions.issue(invitationService.verifyLoginMfa(request.mfaTicket(), request.code()).userId(), httpRequest, SessionService.LoginMethod.OTP_MFA);
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

    public record MfaVerifyRequest(
        @NotBlank(message = "MFA ticket is required.")
        String mfaTicket,

        @NotBlank(message = "MFA code is required.")
        @Pattern(regexp = "[0-9]{6}", message = "MFA code must be 6 digits.")
        String code
) {}

    public record TacVerifyRequest(
        @NotBlank(message = "Email is required.")
        @Email(message = "Invalid email format.")
        String email,

        @NotBlank(message = "OTP is required.")
        @Pattern(regexp = "[0-9]{6}", message = "OTP must be 6 digits.")
        String code
) {}

    public record MessageResponse(String message) {
}

    public record TacSendRequest(@NotBlank(message = "Email is required.")
        @Email(message = "Invalid email format.")
        String email) {
    }

    public record TacSendResponse(String message, int resendCooldown) {
    }
}
