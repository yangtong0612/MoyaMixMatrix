package com.moya.portal.banked.storage;

import java.net.URI;
import java.net.URL;
import java.time.Duration;
import java.time.OffsetDateTime;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.storage.dto.OssConfigView;
import com.moya.portal.banked.storage.dto.StorageAccessUrlRequest;
import com.moya.portal.banked.storage.dto.StorageAccessUrlView;
import com.moya.portal.banked.storage.dto.OssUploadTicketRequest;
import com.moya.portal.banked.storage.dto.OssUploadTicketResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/storage")
public class StorageUploadController {

	private final OssUploadTicketService ticketService;
	private final StorageProperties storageProperties;
	private final StorageService storageService;

	public StorageUploadController(OssUploadTicketService ticketService, StorageProperties storageProperties, StorageService storageService) {
		this.ticketService = ticketService;
		this.storageProperties = storageProperties;
		this.storageService = storageService;
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

	@PostMapping("/access-url")
	public ApiResponse<StorageAccessUrlView> createAccessUrl(@Valid @RequestBody StorageAccessUrlRequest request) {
		if (!storageService.enabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS 未启用，无法生成预览地址");
		}
		String objectKey = resolveObjectKey(request.mediaUrl());
		URL signedUrl = storageService.createDownloadUrl(objectKey, Duration.ofMinutes(20));
		return ApiResponse.ok(new StorageAccessUrlView(signedUrl.toString(), OffsetDateTime.now().plusMinutes(20)));
	}

	private String trimSlashes(String value) {
		if (value == null || value.isBlank()) return "";
		return value.replaceAll("^/+", "").replaceAll("/+$", "");
	}

	private String trimEndpoint(String value) {
		if (value == null || value.isBlank()) return "";
		return value.replaceAll("^https?://", "").replaceAll("/+$", "");
	}

	private String resolveObjectKey(String mediaUrl) {
		if (mediaUrl == null || mediaUrl.isBlank()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mediaUrl 不能为空");
		}
		String bucket = storageProperties.getOss().getBucket();
		String trimmed = mediaUrl.trim();
		if (trimmed.startsWith("oss://")) {
			String value = trimmed.substring("oss://".length());
			int slashIndex = value.indexOf('/');
			if (slashIndex < 0) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效的 OSS 媒体地址");
			}
			String urlBucket = value.substring(0, slashIndex);
			if (!bucket.equals(urlBucket)) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "当前只支持预览本 bucket 内媒体");
			}
			return trimSlashes(value.substring(slashIndex + 1));
		}
		try {
			URI uri = URI.create(trimmed);
			String path = trimSlashes(uri.getPath());
			if (path.isEmpty()) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效的媒体访问地址");
			}
			String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
			if (!host.isBlank() && host.startsWith((bucket + ".").toLowerCase())) {
				return path;
			}
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "当前只支持预览本 bucket 内媒体");
		} catch (IllegalArgumentException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无效的媒体访问地址");
		}
	}
}
