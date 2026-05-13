package com.moya.portal.banked.storage.dto;

import java.time.OffsetDateTime;

public record StorageAccessUrlView(
		String mediaUrl,
		OffsetDateTime expiresAt
) {
}
