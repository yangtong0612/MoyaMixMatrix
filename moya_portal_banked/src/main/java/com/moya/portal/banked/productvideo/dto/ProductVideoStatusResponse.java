package com.moya.portal.banked.productvideo.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record ProductVideoStatusResponse(
		String taskId,
		String status,
		String videoUrl,
		boolean finished,
		boolean successful,
		String message,
		JsonNode raw
) {
}
