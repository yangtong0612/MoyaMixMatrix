package com.moya.portal.banked.drive.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record UploadTaskView(
		UUID id,
		String fileName,
		String fileHash,
		long fileSize,
		long chunkSize,
		int totalChunks,
		int uploadedChunks,
		String status,
		String ossBucket,
		String ossKey,
		String contentType,
		List<Integer> uploadedIndexes,
		OffsetDateTime updatedAt
) {
}
