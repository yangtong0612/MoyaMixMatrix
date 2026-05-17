package com.moya.portal.banked.viral.dto;

import jakarta.validation.constraints.NotBlank;

public record ViralSubtitleRecognizeRequest(
		@NotBlank(message = "mediaUrl 不能为空")
		String mediaUrl,
		String title,
		String startTime,
		String duration
) {
}
