package com.moya.portal.banked.fission.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record FissionMixResponse(
		String jobId,
		String outputMediaUrl,
		JsonNode timeline,
		JsonNode outputMediaConfig,
		boolean submitted
) {
}
