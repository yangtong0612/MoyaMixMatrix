package com.moya.portal.banked.drive.controller;

import java.util.UUID;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.drive.UploadService;
import com.moya.portal.banked.drive.dto.CompleteUploadResponse;
import com.moya.portal.banked.drive.dto.InstantUploadResponse;
import com.moya.portal.banked.drive.dto.UploadPartTicketResponse;
import com.moya.portal.banked.drive.dto.UploadTaskView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive/uploads")
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class UploadController {

	private final UploadService uploadService;

	public UploadController(UploadService uploadService) {
		this.uploadService = uploadService;
	}

	@PostMapping("/instant")
	public ApiResponse<InstantUploadResponse> instantUpload(@AuthenticationPrincipal CurrentUser currentUser,
															@Valid @RequestBody InstantUploadRequest request) {
		return ApiResponse.ok(uploadService.instantUpload(currentUser.id(), request.parentId(), request.fileName(), request.sha256()));
	}

	@PostMapping
	public ApiResponse<UploadTaskView> init(@AuthenticationPrincipal CurrentUser currentUser,
											@Valid @RequestBody InitUploadRequest request) {
		return ApiResponse.ok(uploadService.init(currentUser.id(), new UploadService.InitUploadCommand(
				request.fileName(),
				request.sha256(),
				request.totalBytes(),
				request.chunkSize(),
				request.contentType()
		)));
	}

	@PostMapping("/{id}/ticket")
	public ApiResponse<UploadPartTicketResponse> createTicket(@AuthenticationPrincipal CurrentUser currentUser,
															  @PathVariable UUID id,
															  @Valid @RequestBody CreateTicketRequest request) {
		return ApiResponse.ok(uploadService.createTicket(currentUser.id(), id, request.chunkIndex(), request.partNumber(), request.size()));
	}

	@PostMapping("/{id}/chunks")
	public ApiResponse<UploadTaskView> registerChunk(@AuthenticationPrincipal CurrentUser currentUser,
													 @PathVariable UUID id,
													 @Valid @RequestBody RegisterChunkRequest request) {
		return ApiResponse.ok(uploadService.registerChunk(currentUser.id(), id, request.chunkIndex(), request.partNumber(), request.sizeBytes(), request.etag(), request.checksum()));
	}

	@GetMapping("/{id}")
	public ApiResponse<UploadTaskView> progress(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		return ApiResponse.ok(uploadService.progress(currentUser.id(), id));
	}

	@PostMapping("/{id}/complete")
	public ApiResponse<CompleteUploadResponse> complete(@AuthenticationPrincipal CurrentUser currentUser,
														@PathVariable UUID id,
														@RequestBody CompleteUploadRequest request) {
		return ApiResponse.ok(uploadService.complete(currentUser.id(), id, request.parentId(), request.ossKey(), request.contentType()));
	}

	@PatchMapping("/{id}/cancel")
	public ApiResponse<UploadTaskView> cancel(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		return ApiResponse.ok(uploadService.cancel(currentUser.id(), id));
	}

	public record InstantUploadRequest(UUID parentId, @NotBlank String fileName, @NotBlank String sha256) {
	}

	public record InitUploadRequest(
			@NotBlank String fileName,
			@NotBlank String sha256,
			@Positive long totalBytes,
			@Positive long chunkSize,
			String contentType
	) {
	}

	public record CreateTicketRequest(@Min(0) Integer chunkIndex, @Min(1) Integer partNumber, @Positive long size) {
	}

	public record RegisterChunkRequest(@Min(0) int chunkIndex, @Min(1) Integer partNumber, @Positive long sizeBytes, @NotBlank String etag, String checksum) {
	}

	public record CompleteUploadRequest(UUID parentId, String ossKey, String contentType) {
	}
}
