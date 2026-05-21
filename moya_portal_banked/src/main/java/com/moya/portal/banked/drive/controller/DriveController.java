package com.moya.portal.banked.drive.controller;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.drive.DriveService;
import com.moya.portal.banked.drive.dto.DriveListResult;
import com.moya.portal.banked.drive.dto.DriveNodeContent;
import com.moya.portal.banked.drive.dto.DriveNodeView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive")
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class DriveController {

	private final DriveService driveService;

	public DriveController(DriveService driveService) {
		this.driveService = driveService;
	}

	@GetMapping("/nodes")
	public ApiResponse<DriveListResult> listNodes(@AuthenticationPrincipal CurrentUser currentUser,
												  @RequestParam(required = false) UUID parentId) {
		return ApiResponse.ok(driveService.list(currentUser.id(), parentId));
	}

	@GetMapping("/nodes/{id}")
	public ApiResponse<DriveNodeView> detail(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		return ApiResponse.ok(driveService.detail(currentUser.id(), id));
	}

	@GetMapping("/nodes/{id}/content")
	public ResponseEntity<InputStreamResource> content(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		DriveNodeContent content = driveService.openContent(currentUser.id(), id);
		MediaType mediaType = resolveMediaType(content);
		HttpHeaders headers = new HttpHeaders();
		headers.setContentDisposition(ContentDisposition.inline()
				.filename(content.fileName(), StandardCharsets.UTF_8)
				.build());
		headers.setCacheControl(CacheControl.noStore());
		ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
				.headers(headers)
				.contentType(mediaType);
		if (content.size() != null && content.size() >= 0) {
			builder.contentLength(content.size());
		}
		return builder.body(new InputStreamResource(content.stream()));
	}

	@PostMapping("/folders")
	public ApiResponse<DriveNodeView> createFolder(@AuthenticationPrincipal CurrentUser currentUser,
												   @Valid @RequestBody CreateFolderRequest request) {
		return ApiResponse.ok(driveService.createFolder(currentUser.id(), request.parentId(), request.name()));
	}

	@PatchMapping("/nodes/{id}/rename")
	public ApiResponse<DriveNodeView> rename(@AuthenticationPrincipal CurrentUser currentUser,
											 @PathVariable UUID id,
											 @Valid @RequestBody RenameRequest request) {
		return ApiResponse.ok(driveService.rename(currentUser.id(), id, request.name()));
	}

	@PatchMapping("/nodes/{id}/move")
	public ApiResponse<DriveNodeView> move(@AuthenticationPrincipal CurrentUser currentUser,
										   @PathVariable UUID id,
										   @RequestBody MoveRequest request) {
		return ApiResponse.ok(driveService.move(currentUser.id(), id, request.targetParentId()));
	}

	@DeleteMapping("/nodes/{id}")
	public ApiResponse<DriveNodeView> recycle(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		return ApiResponse.ok(driveService.recycle(currentUser.id(), id));
	}

	@GetMapping("/recycle-bin")
	public ApiResponse<java.util.List<DriveNodeView>> recycleBin(@AuthenticationPrincipal CurrentUser currentUser) {
		return ApiResponse.ok(driveService.recycleBin(currentUser.id()));
	}

	@PostMapping("/recycle-bin/{id}/restore")
	public ApiResponse<DriveNodeView> restore(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		return ApiResponse.ok(driveService.restore(currentUser.id(), id));
	}

	@DeleteMapping("/recycle-bin/{id}")
	public ApiResponse<Void> permanentDelete(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		driveService.permanentDelete(currentUser.id(), id);
		return ApiResponse.ok(null);
	}

	public record CreateFolderRequest(UUID parentId, @NotBlank String name) {
	}

	public record RenameRequest(@NotBlank String name) {
	}

	public record MoveRequest(UUID targetParentId) {
	}

	private MediaType resolveMediaType(DriveNodeContent content) {
		if (content.mimeType() != null && !content.mimeType().isBlank()) {
			try {
				MediaType mediaType = MediaType.parseMediaType(content.mimeType());
				if (!MediaType.APPLICATION_OCTET_STREAM.equals(mediaType)) {
					return mediaType;
				}
			} catch (Exception ignored) {
				// Fall back to filename detection below.
			}
		}
		return MediaTypeFactory.getMediaType(content.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM);
	}
}
