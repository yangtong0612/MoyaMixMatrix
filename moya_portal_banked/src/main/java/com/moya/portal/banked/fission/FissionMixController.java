package com.moya.portal.banked.fission;

import com.fasterxml.jackson.databind.JsonNode;
import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.fission.dto.FissionMixRequest;
import com.moya.portal.banked.fission.dto.FissionMixJobStatusResponse;
import com.moya.portal.banked.fission.dto.FissionMixResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/fission/aliyun-mix")
public class FissionMixController {

	private final FissionMixService service;

	public FissionMixController(FissionMixService service) {
		this.service = service;
	}

	@PostMapping("/timeline")
	public ApiResponse<JsonNode> buildTimeline(@Valid @RequestBody FissionMixRequest request) {
		return ApiResponse.ok(service.buildTimeline(request));
	}

	@PostMapping("/submit")
	public ApiResponse<FissionMixResponse> submit(@Valid @RequestBody FissionMixRequest request) {
		return ApiResponse.ok(service.produce(request));
	}

	@GetMapping("/jobs/{jobId}")
	public ApiResponse<FissionMixJobStatusResponse> getJobStatus(@PathVariable String jobId) {
		return ApiResponse.ok(service.getJobStatus(jobId));
	}
}
