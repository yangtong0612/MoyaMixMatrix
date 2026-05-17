package com.moya.portal.banked.productvideo;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.productvideo.dto.ProductVideoCreateRequest;
import com.moya.portal.banked.productvideo.dto.ProductVideoCreateResponse;
import com.moya.portal.banked.productvideo.dto.ProductVideoStatusResponse;
import jakarta.validation.Valid;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/product-video")
@EnableConfigurationProperties(ProductVideoProperties.class)
public class ProductVideoController {

	private final ProductVideoService service;

	public ProductVideoController(ProductVideoService service) {
		this.service = service;
	}

	@PostMapping("/generate")
	public ApiResponse<ProductVideoCreateResponse> generate(@Valid @RequestBody ProductVideoCreateRequest request) {
		return ApiResponse.ok(service.create(request));
	}

	@GetMapping("/tasks/{taskId}")
	public ApiResponse<ProductVideoStatusResponse> status(@PathVariable String taskId) {
		return ApiResponse.ok(service.status(taskId));
	}
}
