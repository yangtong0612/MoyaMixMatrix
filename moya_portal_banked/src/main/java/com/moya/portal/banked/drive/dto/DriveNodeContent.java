package com.moya.portal.banked.drive.dto;

import java.io.InputStream;

public record DriveNodeContent(
		String fileName,
		String mimeType,
		Long size,
		InputStream stream
) {
}
