package com.aiosnova.access;

import org.springframework.stereotype.Service;
import java.util.List;

import com.aiosnova.auth.SessionService;

@Service 
public class PermissionService {
    private final RoleRepository repository;

    public PermissionService(RoleRepository repository){
        this.repository = repository;
    }

    public boolean hasPermission(SessionService.Actor actor, String permissionCode){
        return repository.hasRolePermission(actor.merchantId(), actor.id(), permissionCode);
    }

    public List<String> effectivePermissionCodes(SessionService.Actor actor){
        return repository.effectivePermissionCodes(actor.merchantId(), actor.id());
    }
}
