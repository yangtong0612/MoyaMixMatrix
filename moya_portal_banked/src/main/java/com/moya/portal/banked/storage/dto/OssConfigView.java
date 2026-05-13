package com.moya.portal.banked.storage.dto;

public record OssConfigView(
		boolean enabled,
		String endpoint,
		String bucket,
		String rootPrefix,
		String outputPrefix
) {
}
