package com.moya.portal.banked.productvideo.dto;

public record ProductVideoConfigStatusResponse(
		boolean enabled,
		boolean hasApiKey,
		boolean configured,
		String model,
		String message
) {
}
