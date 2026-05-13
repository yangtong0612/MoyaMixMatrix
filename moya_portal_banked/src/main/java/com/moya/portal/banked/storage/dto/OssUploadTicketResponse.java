package com.moya.portal.banked.storage.dto;

import java.time.OffsetDateTime;

public record OssUploadTicketResponse(
		String uploadUrl,
		String bucket,
		String objectKey,
		String mediaUrl,
		String contentType,
		OffsetDateTime expiresAt
) {
}
