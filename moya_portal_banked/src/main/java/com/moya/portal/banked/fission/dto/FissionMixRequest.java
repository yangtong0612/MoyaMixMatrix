package com.moya.portal.banked.fission.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

public record FissionMixRequest(
		@NotEmpty List<@Valid ShotGroup> groups,
		List<@Valid AudioAsset> audioItems,
		@Valid MixSettings settings,
		Integer variantIndex,
		@NotBlank String outputMediaUrl,
		Boolean dryRun
) {

	public record ShotGroup(
			@NotBlank String id,
			Integer sceneNo,
			@NotBlank String title,
			String duration,
			String script,
			String voiceover,
			@NotEmpty List<@Valid VideoAsset> clips,
			List<@Valid AudioAsset> groupAudios
	) {
	}

	public record VideoAsset(
			@NotBlank String id,
			@NotBlank String name,
			String duration,
			@NotBlank String mediaUrl
	) {
	}

	public record AudioAsset(
			@NotBlank String id,
			@NotBlank String name,
			String duration,
			Integer volume,
			@NotBlank String mediaUrl
	) {
	}

	public record MixSettings(
			Boolean followAudioSpeed,
			Boolean retainOriginalAudio,
			Boolean ducking,
			Boolean fadeInOut,
			Integer volume,
			Integer width,
			Integer height,
			Integer bitrate
	) {
	}
}
