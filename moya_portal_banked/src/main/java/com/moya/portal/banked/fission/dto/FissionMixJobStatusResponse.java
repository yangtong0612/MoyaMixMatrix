package com.moya.portal.banked.fission.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record FissionMixJobStatusResponse(
		String jobId,
		String status,
		String code,
		String message,
		String mediaUrl,
		Float duration,
		String createTime,
		String completeTime,
		boolean finished,
		boolean successful,
		JsonNode raw
) {
}
