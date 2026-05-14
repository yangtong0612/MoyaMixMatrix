package com.moya.portal.banked.share;

import java.util.List;
import java.util.UUID;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.drive.dto.DriveNodeView;
import com.moya.portal.banked.share.dto.DirectShareView;
import com.moya.portal.banked.share.dto.ShareLinkView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/share")
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ShareController {

	private final ShareService shareService;

	public ShareController(ShareService shareService) {
		this.shareService = shareService;
	}

	@PostMapping("/links")
	public ApiResponse<ShareLinkView> createLink(@AuthenticationPrincipal CurrentUser currentUser, @Valid @RequestBody CreateLinkRequest request) {
		return ApiResponse.ok(shareService.createLink(currentUser.id(), new ShareService.CreateShareLinkCommand(
				request.fileNodeIds(), request.extractCode(), request.validityDays(), request.allowPreview(), request.allowDownload())));
	}

	@GetMapping("/links/public/{shareCode}")
	public ApiResponse<ShareLinkView> publicView(@PathVariable String shareCode, @RequestParam(required = false) String extractCode) {
		return ApiResponse.ok(shareService.publicView(shareCode, extractCode));
	}

	@PostMapping("/links/public/{shareCode}/save")
	public ApiResponse<DriveNodeView> saveLinkItem(@AuthenticationPrincipal CurrentUser currentUser,
												   @PathVariable String shareCode,
												   @RequestParam(required = false) String extractCode,
												   @Valid @RequestBody SaveLinkRequest request) {
		return ApiResponse.ok(shareService.saveLinkItem(currentUser.id(), shareCode, extractCode, request.shareItemId(), request.targetParentId()));
	}

	@DeleteMapping("/links/{id}")
	public ApiResponse<Void> cancelLink(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		shareService.cancelLink(currentUser.id(), id);
		return ApiResponse.ok(null);
	}

	@PostMapping("/direct")
	public ApiResponse<DirectShareView> sendDirect(@AuthenticationPrincipal CurrentUser currentUser, @Valid @RequestBody SendDirectRequest request) {
		return ApiResponse.ok(shareService.sendDirect(currentUser.id(), request.fileNodeId(), request.receiver()));
	}

	@GetMapping("/direct/inbox")
	public ApiResponse<List<DirectShareView>> inbox(@AuthenticationPrincipal CurrentUser currentUser) {
		return ApiResponse.ok(shareService.inbox(currentUser.id()));
	}

	@PostMapping("/direct/{id}/save")
	public ApiResponse<DriveNodeView> saveDirect(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id, @RequestBody SaveDirectRequest request) {
		return ApiResponse.ok(shareService.saveDirect(currentUser.id(), id, request.targetParentId()));
	}

	@DeleteMapping("/direct/{id}")
	public ApiResponse<Void> cancelDirect(@AuthenticationPrincipal CurrentUser currentUser, @PathVariable UUID id) {
		shareService.cancelDirect(currentUser.id(), id);
		return ApiResponse.ok(null);
	}

	public record CreateLinkRequest(@NotEmpty List<UUID> fileNodeIds, String extractCode, Integer validityDays,
									boolean allowPreview, boolean allowDownload) {
	}

	public record SaveLinkRequest(@NotNull UUID shareItemId, UUID targetParentId) {
	}

	public record SendDirectRequest(@NotNull UUID fileNodeId, @NotBlank String receiver) {
	}

	public record SaveDirectRequest(UUID targetParentId) {
	}
}
