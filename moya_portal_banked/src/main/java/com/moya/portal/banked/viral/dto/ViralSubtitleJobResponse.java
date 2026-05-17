package com.moya.portal.banked.viral.dto;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;

public record ViralSubtitleJobResponse(
		String jobId,
		String status,
		boolean finished,
		boolean successful,
		List<ViralSubtitleSegment> segments,
		String text,
		JsonNode raw
) {
}
