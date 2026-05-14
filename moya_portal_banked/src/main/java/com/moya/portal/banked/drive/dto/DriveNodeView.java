package com.moya.portal.banked.drive.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record DriveNodeView(
		UUID id,
		UUID parentId,
		String name,
		String nodeType,
		Long size,
		String mimeType,
		String fileHash,
		String ossBucket,
		String ossKey,
		String previewUrl,
		String downloadUrl,
		String coverUrl,
		OffsetDateTime updatedAt
) {
}
