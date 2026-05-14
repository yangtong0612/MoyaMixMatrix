package com.moya.portal.banked.verification;

import com.moya.portal.banked.common.response.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/verification")
public class VerificationController {

	private final VerificationCodeClient verificationCodeClient;

	public VerificationController(VerificationCodeClient verificationCodeClient) {
		this.verificationCodeClient = verificationCodeClient;
	}

	@PostMapping("/send")
	public ApiResponse<SendResponse> send(@Valid @RequestBody SendRequest request) {
		String devCode = verificationCodeClient.send(request.scene(), request.channel(), request.target());
		return ApiResponse.ok(new SendResponse("sent", devCode));
	}

	@PostMapping("/check")
	public ApiResponse<Void> check(@Valid @RequestBody CheckRequest request) {
		verificationCodeClient.verifyAndConsume(request.scene(), request.channel(), request.target(), request.code());
		return ApiResponse.ok(null);
	}

	public record SendRequest(@NotBlank String scene, @NotBlank String channel, @NotBlank String target) {
	}

	public record CheckRequest(@NotBlank String scene, @NotBlank String channel, @NotBlank String target, @NotBlank String code) {
	}

	public record SendResponse(String status, String devCode) {
	}
}
