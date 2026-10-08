package com.aiosnova.auth;

import java.security.SecureRandom;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import com.aiosnova.mail.EmailService;
import com.google.zxing.WriterException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Profile("local")
@Transactional(rollbackFor = Exception.class, noRollbackFor = ResponseStatusException.class)
public class InvitationService {

    private final EmailService emailService;
    private final String frontendUrl;
    private final String merchantId;
    private final TotpService totpService;
    private final AuthRepository repository;
    private final AuthSecretService secrets;
    private final SecureRandom random = new SecureRandom();

    public InvitationService(EmailService emailService, TotpService totpService,
                             AuthRepository repository, AuthSecretService secrets,
                             @Value("${app.frontend-url}") String frontendUrl,
                             @Value("${app.local-merchant-id}") String merchantId) {
        this.emailService = emailService;
        this.frontendUrl = frontendUrl;
        this.merchantId = merchantId;
        this.totpService = totpService;
        this.repository = repository;
        this.secrets = secrets;
    }

    public SentInvitation send(InvitationRequest request, SessionService.Actor actor) {
        repository.merchantOwner(merchantId);
        if (!merchantId.equals(actor.merchantId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        actor = repository.actor(merchantId, actor.id());
        if (actor == null || !"active".equals(actor.status()) || (!actor.owner() && !actor.manageUsers() && !actor.canInvite())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        List<AuthRepository.Company> companies = repository.companies(merchantId).stream()
                .filter(company -> request.companyCodes().contains(company.code())).toList();
        if (companies.isEmpty() || companies.size() != request.companyCodes().size()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        String email = normalize(request.email());
        AuthRepository.User user = repository.user(email, true);
        if (user != null && repository.actor(merchantId, user.id()) == null) throw new ResponseStatusException(HttpStatus.CONFLICT);
        if (user != null && !"invited".equals(user.status())) throw new ResponseStatusException(HttpStatus.CONFLICT);
        String userId = user == null ? UUID.randomUUID().toString() : user.id();
        if (user == null) repository.createUser(userId, email, request.fullName(), request.language());
        repository.revokeInvitations(merchantId, userId);
        String token = randomToken("");
        String id = UUID.randomUUID().toString();
        Instant now = Instant.now();
        repository.createInvitation(id, merchantId, userId, actor.id(), email, request.fullName(), request.language(),
                request.personalMessage(), secrets.tokenHash(token), request.requireMfa(), now, now.plusSeconds(7 * 86400));
        for (AuthRepository.Company company : companies) {
            repository.assignCompany(UUID.randomUUID().toString(), merchantId, id, company.id());
        }
        repository.audit(merchantId, actor.id(), "invitation.sent", "invitation", id);
        String link = frontendUrl + "/activate?token=" + token;
        boolean chinese = "zh-CN".equals(request.language());
        String body = request.personalMessage() + "\n\n"
                + (chinese ? "查看您的邀请：" : "View your invitation: ") + link + "\n\n"
                + (chinese ? "此链接将在七天后过期。" : "This link expires in seven days.");
        emailService.send(email, chinese ? "AIOS Nova 账户邀请" : "Your AIOS Nova invitation", body);
        return new SentInvitation(userId);
    }

    public Invitation get(String token) {
        AuthRepository.Invite invite = requireInvitation(token, false);
        List<AuthRepository.Company> companies = repository.invitationCompanies(invite.merchantId(), invite.id());
        return new Invitation(invite.userId(), invite.email(), invite.fullName(),
                companies.stream().map(AuthRepository.Company::name).toList(), requiresMfa(invite, companies), invite.expiresAt());
    }

    @Transactional(readOnly = true)
    public Directory directory() {
        return new Directory(repository.directoryUsers(merchantId), repository.directoryMemberships(merchantId));
    }

    public TotpService.Setup startEnrollment(String token) throws WriterException {
        AuthRepository.Invite invite = requireInvitation(token, true);
        List<AuthRepository.Company> companies = repository.invitationCompanies(invite.merchantId(), invite.id());
        if (!requiresMfa(invite, companies)) throw new ResponseStatusException(HttpStatus.CONFLICT);
        AuthRepository.Mfa enrollment = repository.enrollment(invite.id());
        if (enrollment == null) {
            byte[] secret = totpService.createSecret();
            repository.createEnrollment(UUID.randomUUID().toString(), invite.userId(), invite.id(),
                    secrets.encrypt(invite.userId(), secret));
            return totpService.setup(secret, invite.email());
        }
        if (enrollment.attempts() >= 5) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        return totpService.setup(secrets.decrypt(invite.userId(), enrollment.encryptedSecret()), invite.email());
    }

    public Account activate(String token, String code) throws GeneralSecurityException {
        AuthRepository.Invite invite = requireInvitation(token, true);
        List<AuthRepository.Company> companies = repository.invitationCompanies(invite.merchantId(), invite.id());
        if (companies.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT);
        boolean requireMfa = requiresMfa(invite, companies);
        Instant now = Instant.now();
        if (requireMfa) {
            AuthRepository.Mfa enrollment = repository.enrollment(invite.id());
            if (enrollment == null) throw new ResponseStatusException(HttpStatus.CONFLICT);
            if (enrollment.attempts() >= 5) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
            long counter = totpService.verify(secrets.decrypt(invite.userId(), enrollment.encryptedSecret()), code, -1);
            if (counter < 0) {
                repository.mfaFailure(enrollment.id());
                throw new ResponseStatusException(enrollment.attempts() + 1 >= 5
                        ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.UNAUTHORIZED);
            }
            repository.enableMfa(enrollment.id(), counter, now);
        }
        repository.activate(invite, companies, now);
        repository.audit(invite.merchantId(), invite.userId(), "invitation.accepted", "invitation", invite.id());
        return account(invite.email());
    }

    public boolean canRequestOtp(String email) {
        AuthRepository.User user = repository.user(normalize(email), true);
        return user != null && "active".equals(user.status()) && repository.accepted(user.id())
                && (!repository.requiresMfa(user.id()) || repository.credential(user.id()) != null);
    }

    public Account account(String email) {
        AuthRepository.User user = repository.user(normalize(email), true);
        if (user == null || !"active".equals(user.status()) || !repository.accepted(user.id())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return new Account(user.id(), user.email(), user.fullName(), repository.requiresMfa(user.id()),
                repository.credential(user.id()) != null);
    }

    public String loginMfaTicket(String email) {
        Account account = account(email);
        if (!account.requireMfa() && !account.mfaEnabled()) return null;
        String ticket = randomToken("activation_");
        repository.createTicket(UUID.randomUUID().toString(), account.userId(), secrets.tokenHash(ticket), Instant.now());
        return ticket;
    }

    public Account verifyLoginMfa(String ticket, String code) throws GeneralSecurityException {
        String hash = secrets.tokenHash(ticket);
        AuthRepository.Ticket challenge = repository.ticket(hash, false);
        if (challenge == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        repository.lockUser(challenge.userId());
        challenge = repository.ticket(hash, true);
        if (!"restricted".equals(challenge.status()) || !Instant.now().isBefore(challenge.expiresAt())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (challenge.attempts() >= 5) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        AuthRepository.User user = repository.userById(challenge.userId());
        if (!canRequestOtp(user.email())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        AuthRepository.Mfa credential = repository.credential(user.id());
        if (credential == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        long counter = totpService.verify(secrets.decrypt(user.id(), credential.encryptedSecret()), code, credential.lastCounter());
        if (counter < 0) {
            repository.ticketFailure(challenge.id());
            throw new ResponseStatusException(challenge.attempts() + 1 >= 5
                    ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.UNAUTHORIZED);
        }
        repository.useMfa(credential.id(), counter);
        repository.consumeTicket(challenge.id());
        return account(user.email());
    }

    private AuthRepository.Invite requireInvitation(String token, boolean lock) {
        String hash = secrets.tokenHash(token);
        AuthRepository.Invite invite = repository.invitation(hash, false);
        if (invite == null) throw new ResponseStatusException(HttpStatus.GONE);
        if (lock) {
            repository.lockUser(invite.userId());
            invite = repository.invitation(hash, true);
        }
        if (!"sent".equals(invite.status()) || !Instant.now().isBefore(invite.expiresAt())) {
            throw new ResponseStatusException(HttpStatus.GONE);
        }
        AuthRepository.User user = repository.userById(invite.userId());
        if (!"invited".equals(user.status()) || !user.email().equals(invite.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return invite;
    }

    private boolean requiresMfa(AuthRepository.Invite invite, List<AuthRepository.Company> companies) {
        return invite.requireMfa() || repository.requiresMfa(invite.userId())
                || companies.stream().anyMatch(AuthRepository.Company::requireMfa);
    }

    private String randomToken(String prefix) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return prefix + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    public record Account(String userId, String email, String fullName, boolean requireMfa, boolean mfaEnabled) { }
    public record SentInvitation(String userId) { }
    public record Directory(List<AuthRepository.DirectoryUser> users,
                            List<AuthRepository.DirectoryMembership> memberships) { }
    public record InvitationRequest(String userId, String email, String fullName, List<String> companyCodes,
                                    boolean requireMfa, String language, String personalMessage) { }
    public record Invitation(String userId, String email, String fullName, List<String> companies,
                             boolean requireMfa, Instant expiresAt) { }
}
