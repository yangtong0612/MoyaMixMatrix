package com.moya.portal.banked.user.dto;

import java.util.UUID;

public record MeResponse(
		UUID id,
		String username,
		String email,
		String phone,
		String displayName,
		long quotaTotal,
		long quotaUsed,
		long quotaRemaining
) {
}
