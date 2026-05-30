package com.moya.portal.banked.drive.controller;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.user.AuthService;
import com.moya.portal.banked.user.dto.MeResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive")
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class DriveAccountController {

	private final AuthService authService;

	public DriveAccountController(AuthService authService) {
		this.authService = authService;
	}

	@GetMapping("/me")
	public ApiResponse<MeResponse> me(@AuthenticationPrincipal CurrentUser currentUser) {
		return ApiResponse.ok(authService.me(currentUser.id()));
	}
}
