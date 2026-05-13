package com.moya.portal.banked.storage;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.storage.dto.OssConfigView;
import com.moya.portal.banked.storage.dto.OssUploadTicketRequest;
import com.moya.portal.banked.storage.dto.OssUploadTicketResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/storage")
public class StorageUploadController {

	private final OssUploadTicketService ticketService;
	private final StorageProperties storageProperties;

	public StorageUploadController(OssUploadTicketService ticketService, StorageProperties storageProperties) {
		this.ticketService = ticketService;
		this.storageProperties = storageProperties;
	}

	@GetMapping("/oss-config")
	public ApiResponse<OssConfigView> ossConfig() {
		StorageProperties.Oss oss = storageProperties.getOss();
		return ApiResponse.ok(new OssConfigView(
				oss.isEnabled(),
				trimEndpoint(oss.getEndpoint()),
				oss.getBucket(),
				trimSlashes(oss.getRootPrefix()),
				trimSlashes(oss.getOutputPrefix())
		));
	}

	@PostMapping("/upload-ticket")
	public ApiResponse<OssUploadTicketResponse> createUploadTicket(@Valid @RequestBody OssUploadTicketRequest request) {
		return ApiResponse.ok(ticketService.createTicket(request));
	}

	private String trimSlashes(String value) {
		if (value == null || value.isBlank()) return "";
		return value.replaceAll("^/+", "").replaceAll("/+$", "");
	}

	private String trimEndpoint(String value) {
		if (value == null || value.isBlank()) return "";
		return value.replaceAll("^https?://", "").replaceAll("/+$", "");
	}
}
