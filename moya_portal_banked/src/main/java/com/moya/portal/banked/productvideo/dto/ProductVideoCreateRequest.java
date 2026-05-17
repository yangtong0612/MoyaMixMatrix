package com.moya.portal.banked.productvideo.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;

public record ProductVideoCreateRequest(
		@NotBlank String scenario,
		String description,
		List<String> imageUrls,
		String referenceVideoUrl,
		Boolean scriptEnabled,
		String avatarMode,
		String avatarSource,
		String avatarId,
		String avatarName,
		String avatarImageUrl,
		String quality,
		String ratio,
		String duration,
		String model
) {
}
