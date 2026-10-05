package com.aiosnova.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final TacService tacService;
    private final OtpThrottleService otpThrottleService;

    public AuthController(TacService tacService, OtpThrottleService otpThrottleService) {
        this.tacService = tacService;
        this.otpThrottleService = otpThrottleService;
    }

    @PostMapping("/login/tac/send")
    public ResponseEntity<TacSendResponse> sendTac(
            @RequestBody TacSendRequest request,
            HttpServletRequest httpRequest) {

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
    public ResponseEntity<MessageResponse> verifyTac(@RequestBody TacVerifyRequest request) {
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

        return ResponseEntity.ok(new MessageResponse("OTP verified."));
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
