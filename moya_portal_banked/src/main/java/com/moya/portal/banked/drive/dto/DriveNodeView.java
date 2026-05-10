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
		String coverUrl,
		OffsetDateTime updatedAt
) {
}
