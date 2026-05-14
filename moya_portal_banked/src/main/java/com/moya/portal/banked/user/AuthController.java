package com.moya.portal.banked.user;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.user.dto.AuthTokenResponse;
import com.moya.portal.banked.user.dto.MeResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/register")
	public ApiResponse<AuthTokenResponse> register(@Valid @RequestBody RegisterRequest request) {
		return ApiResponse.ok(authService.register(new AuthService.RegisterCommand(
				request.username(), request.password(), request.email(), request.phone(), request.displayName(),
				request.verificationChannel(), request.verificationTarget(), request.verificationCode())));
	}

	@PostMapping("/login")
	public ApiResponse<AuthTokenResponse> login(@Valid @RequestBody LoginRequest request) {
		return ApiResponse.ok(authService.login(new AuthService.LoginCommand(request.account(), request.password())));
	}

	@PostMapping("/reset-password")
	public ApiResponse<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
		authService.resetPassword(new AuthService.ResetPasswordCommand(
				request.verificationChannel(), request.verificationTarget(), request.verificationCode(), request.newPassword()));
		return ApiResponse.ok(null);
	}

	@PostMapping("/oauth/login")
	public ApiResponse<AuthTokenResponse> oauthLogin(@Valid @RequestBody OAuthLoginRequest request) {
		return ApiResponse.ok(authService.oauthLogin(new AuthService.OAuthLoginCommand(
				request.provider(), request.openid(), request.unionid(), request.displayName())));
	}

	@GetMapping("/me")
	public ApiResponse<MeResponse> me(@AuthenticationPrincipal CurrentUser currentUser) {
		return ApiResponse.ok(authService.me(currentUser.id()));
	}

	public record RegisterRequest(@NotBlank String username, @NotBlank String password, String email, String phone, String displayName,
								  String verificationChannel, String verificationTarget, String verificationCode) {
	}

	public record LoginRequest(@NotBlank String account, @NotBlank String password) {
	}

	public record ResetPasswordRequest(@NotBlank String verificationChannel, @NotBlank String verificationTarget,
									   @NotBlank String verificationCode, @NotBlank String newPassword) {
	}

	public record OAuthLoginRequest(@NotBlank String provider, @NotBlank String openid, String unionid, String displayName) {
	}
}
