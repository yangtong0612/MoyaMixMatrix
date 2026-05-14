package com.moya.portal.banked.share.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ShareLinkView(
		UUID id,
		String shareCode,
		OffsetDateTime expireAt,
		boolean allowPreview,
		boolean allowDownload,
		boolean canceled,
		List<ShareItemView> items
) {
}
