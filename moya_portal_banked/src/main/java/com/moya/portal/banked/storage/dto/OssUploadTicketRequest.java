package com.moya.portal.banked.storage.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record OssUploadTicketRequest(
		@NotBlank String fileName,
		String contentType,
		String folder,
		@Positive long size
) {
}
