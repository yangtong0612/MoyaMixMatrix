package com.moya.portal.banked.storage.dto;

import jakarta.validation.constraints.NotBlank;

public record StorageAccessUrlRequest(
		@NotBlank String mediaUrl
) {
}
