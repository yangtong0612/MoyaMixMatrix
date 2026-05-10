package com.moya.portal.banked.drive.dto;

import java.util.List;
import java.util.UUID;

public record DriveListResult(
		UUID parentId,
		List<DriveNodeView> nodes
) {
}
