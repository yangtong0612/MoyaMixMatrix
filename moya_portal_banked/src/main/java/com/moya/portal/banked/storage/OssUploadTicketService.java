package com.moya.portal.banked.storage;

import java.net.URL;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.moya.portal.banked.storage.dto.OssUploadTicketRequest;
import com.moya.portal.banked.storage.dto.OssUploadTicketResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OssUploadTicketService {

	private static final Duration TICKET_TTL = Duration.ofMinutes(20);

	private final StorageProperties properties;

	public OssUploadTicketService(StorageProperties properties) {
		this.properties = properties;
	}

	public OssUploadTicketResponse createTicket(OssUploadTicketRequest request) {
		StorageProperties.Oss oss = properties.getOss();
		if (!oss.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS 未启用，请配置 MOYA_OSS_ENABLED=true");
		}
		if (isBlank(oss.getEndpoint()) || isBlank(oss.getAccessKeyId()) || isBlank(oss.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS endpoint 或访问密钥未配置");
		}

		String contentType = isBlank(request.contentType()) ? "application/octet-stream" : request.contentType();
		String objectKey = buildObjectKey(oss.getRootPrefix(), request.folder(), request.fileName());
		Date expiration = new Date(System.currentTimeMillis() + TICKET_TTL.toMillis());
		GeneratePresignedUrlRequest signedRequest = new GeneratePresignedUrlRequest(oss.getBucket(), objectKey, HttpMethod.PUT);
		signedRequest.setExpiration(expiration);
		signedRequest.setContentType(contentType);

		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			URL uploadUrl = ossClient.generatePresignedUrl(signedRequest);
			return new OssUploadTicketResponse(
					uploadUrl.toString(),
					oss.getBucket(),
					objectKey,
					buildPublicMediaUrl(oss, objectKey),
					contentType,
					OffsetDateTime.now().plus(TICKET_TTL)
			);
		} finally {
			ossClient.shutdown();
		}
	}

	private String buildObjectKey(String rootPrefix, String folder, String fileName) {
		String safeRoot = trimSlashes(isBlank(rootPrefix) ? "moya-drive" : rootPrefix);
		String safeFolder = trimSlashes(isBlank(folder) ? "fission-media" : folder);
		String safeName = sanitizeFileName(fileName);
		String ext = "";
		int dotIndex = safeName.lastIndexOf('.');
		if (dotIndex >= 0) {
			ext = safeName.substring(dotIndex).toLowerCase(Locale.ROOT);
		}
		return safeRoot + "/" + safeFolder + "/" + UUID.randomUUID() + ext;
	}

	private String sanitizeFileName(String fileName) {
		String safeName = fileName == null ? "media" : fileName.replaceAll("[\\\\/:*?\"<>|\\s]+", "-");
		return safeName.isBlank() ? "media" : safeName;
	}

	private String trimSlashes(String value) {
		return value.replaceAll("^/+", "").replaceAll("/+$", "");
	}

	private String buildPublicMediaUrl(StorageProperties.Oss oss, String objectKey) {
		String endpoint = trimEndpoint(oss.getEndpoint());
		if (endpoint.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS endpoint 未配置，无法生成媒体访问地址");
		}
		String host = endpoint.startsWith(oss.getBucket() + ".") ? endpoint : oss.getBucket() + "." + endpoint;
		return "https://" + host + "/" + trimSlashes(objectKey);
	}

	private String trimEndpoint(String value) {
		if (isBlank(value)) return "";
		return value.replaceAll("^https?://", "").replaceAll("/+$", "");
	}

	private boolean isBlank(String value) {
		return value == null || value.trim().isEmpty();
	}
}
