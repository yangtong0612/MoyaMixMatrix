package com.moya.portal.banked.productvideo.dto;

public record ProductVideoCreateResponse(
		String taskId,
		String provider,
		String model,
		String status,
		String prompt
) {
}
