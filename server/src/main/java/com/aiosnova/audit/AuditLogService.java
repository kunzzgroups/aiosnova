package com.aiosnova.audit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.util.Map;

import com.aiosnova.auth.AuthRepository;

@Service 
public class AuditLogService {
    private final AuthRepository repository;

    public AuditLogService(AuthRepository repository){
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordMerchantSuccess(
            String merchantId, String actorId, String action, String resourceType, String resourceId,
            Map<String, Object> changes) {
        repository.auditMerchant(merchantId, actorId, action, resourceType, resourceId, changes);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordCompanySuccess(
            String merchantId, String actorId, String companyId, String action, String resourceType, String resourceId,
            Map<String, Object> changes) {
        repository.auditCompany(merchantId, actorId, companyId, action, resourceType, resourceId, changes);
    }

    @Transactional (propagation = Propagation.REQUIRES_NEW)
    public void recordLoginFailure(String merchantId, String targetUserId, LoginFailureReason reason) {
        var target = repository.actor(merchantId, targetUserId);

        if (target == null) {
            throw new IllegalArgumentException("Login failure target does not belong to merchant");
        } 
        repository.auditLoginFailure(merchantId, targetUserId, reason.name());

    }

    public enum LoginFailureReason {
        INVALID_OTP,
        OTP_EXPIRED,
        OTP_ATTEMPTS_EXCEEDED,
        INVALID_MFA,
        MFA_TICKET_EXPIRED,
        MFA_ATTEMPTS_EXCEEDED
    }

}
