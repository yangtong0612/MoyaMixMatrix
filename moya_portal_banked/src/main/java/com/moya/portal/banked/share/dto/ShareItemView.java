package com.moya.portal.banked.share.dto;

import java.util.UUID;

import com.moya.portal.banked.drive.dto.DriveNodeView;

public record ShareItemView(UUID id, UUID nodeId, DriveNodeView node) {
}
