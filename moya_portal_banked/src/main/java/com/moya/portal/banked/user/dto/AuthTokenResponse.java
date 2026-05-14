package com.moya.portal.banked.user.dto;

import java.util.UUID;

public record AuthTokenResponse(String token, UUID userId, String username) {
}
