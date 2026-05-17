package com.moya.portal.banked.viral;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.viral.dto.ViralSubtitleJobResponse;
import com.moya.portal.banked.viral.dto.ViralSubtitleRecognizeRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/viral/subtitles")
public class ViralSubtitleController {

	private final ViralSubtitleService service;

	public ViralSubtitleController(ViralSubtitleService service) {
		this.service = service;
	}

	@PostMapping("/recognize")
	public ApiResponse<ViralSubtitleJobResponse> recognize(@Valid @RequestBody ViralSubtitleRecognizeRequest request) {
		return ApiResponse.ok(service.submit(request));
	}

	@GetMapping("/jobs/{jobId}")
	public ApiResponse<ViralSubtitleJobResponse> getJob(@PathVariable String jobId) {
		return ApiResponse.ok(service.getJob(jobId));
	}
}
