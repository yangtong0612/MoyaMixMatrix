package com.moya.portal.banked.drive.dto;

import java.time.OffsetDateTime;

public record UploadPartTicketResponse(
		String uploadUrl,
		String bucket,
		String objectKey,
		String uploadId,
		int chunkIndex,
		int partNumber,
		long start,
		long end,
		long sizeBytes,
		String contentType,
		OffsetDateTime expiresAt
) {
}
