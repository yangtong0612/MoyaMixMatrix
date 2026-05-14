package com.moya.portal.banked.share.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.moya.portal.banked.drive.dto.DriveNodeView;

public record DirectShareView(
		UUID id,
		UUID senderId,
		UUID receiverId,
		String status,
		boolean saved,
		boolean canceled,
		DriveNodeView node,
		OffsetDateTime createdAt
) {
}
