package com.moya.portal.banked.common.security;

import java.util.UUID;

public record CurrentUser(UUID id, String username) {
}
