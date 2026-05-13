package com.moya.portal.banked.system;

import java.util.Map;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.storage.StorageProperties;
import com.moya.portal.banked.storage.StorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemController {

	private final String applicationName;
	private final boolean databaseEnabled;
	private final StorageService storageService;
	private final StorageProperties storageProperties;

	public SystemController(
			@Value("${spring.application.name}") String applicationName,
			@Value("${moya.database.enabled:true}") boolean databaseEnabled,
			StorageService storageService,
			StorageProperties storageProperties
	) {
		this.applicationName = applicationName;
		this.databaseEnabled = databaseEnabled;
		this.storageService = storageService;
		this.storageProperties = storageProperties;
	}

	@GetMapping("/health")
	public ApiResponse<Map<String, Object>> health() {
		return ApiResponse.ok(Map.of(
				"application", applicationName,
				"status", "UP",
				"databaseEnabled", databaseEnabled,
				"storageProvider", storageService.provider(),
				"storageEnabled", storageService.enabled(),
				"bucket", storageProperties.getOss().getBucket()
		));
	}
}
