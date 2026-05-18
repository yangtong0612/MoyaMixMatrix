package com.moya.portal.banked.storage;

import java.net.URL;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

import com.aliyun.oss.ClientException;
import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.AbortMultipartUploadRequest;
import com.aliyun.oss.model.CompleteMultipartUploadRequest;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.aliyun.oss.model.InitiateMultipartUploadRequest;
import com.aliyun.oss.model.InitiateMultipartUploadResult;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.PartETag;
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
<<<<<<< HEAD
		if (!oss.isEnabled()) {
			String missing = oss.missingConfigMessage();
			throw new ResponseStatusException(
					HttpStatus.BAD_REQUEST,
					missing.isBlank()
							? "OSS 未启用，请配置 MOYA_OSS_ENABLED=true"
							: "OSS 配置不完整，缺少：" + missing
			);
		}
		if (isBlank(oss.getEndpoint()) || isBlank(oss.getAccessKeyId()) || isBlank(oss.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS endpoint 或访问密钥未配置");
		}
=======
		requireOssEnabled(oss);
>>>>>>> gu

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

	public MultipartUploadInit createMultipartUpload(String fileName, String contentType, String folder) {
		StorageProperties.Oss oss = properties.getOss();
		requireOssEnabled(oss);
		String finalContentType = isBlank(contentType) ? "application/octet-stream" : contentType;
		String objectKey = buildObjectKey(oss.getRootPrefix(), folder, fileName);
		ObjectMetadata metadata = new ObjectMetadata();
		metadata.setContentType(finalContentType);
		InitiateMultipartUploadRequest request = new InitiateMultipartUploadRequest(oss.getBucket(), objectKey, metadata);
		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			InitiateMultipartUploadResult result = ossClient.initiateMultipartUpload(request);
			return new MultipartUploadInit(result.getBucketName(), result.getKey(), result.getUploadId(), finalContentType);
		} finally {
			ossClient.shutdown();
		}
	}

	public URL createUploadPartUrl(String objectKey, String uploadId, int partNumber, String contentType) {
		StorageProperties.Oss oss = properties.getOss();
		requireOssEnabled(oss);
		Date expiration = new Date(System.currentTimeMillis() + TICKET_TTL.toMillis());
		GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(oss.getBucket(), objectKey, HttpMethod.PUT);
		request.setExpiration(expiration);
		if (!isBlank(contentType)) {
			request.setContentType(contentType);
		}
		request.addQueryParameter("partNumber", String.valueOf(partNumber));
		request.addQueryParameter("uploadId", uploadId);
		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			return ossClient.generatePresignedUrl(request);
		} finally {
			ossClient.shutdown();
		}
	}

	public OffsetDateTime ticketExpiresAt() {
		return OffsetDateTime.now().plus(TICKET_TTL);
	}

	public void completeMultipartUpload(String objectKey, String uploadId, List<PartETag> partETags) {
		StorageProperties.Oss oss = properties.getOss();
		requireOssEnabled(oss);
		List<PartETag> mutablePartETags = new ArrayList<>(partETags);
		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			ossClient.completeMultipartUpload(new CompleteMultipartUploadRequest(oss.getBucket(), objectKey, uploadId, mutablePartETags));
		} catch (OSSException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossErrorMessage("complete multipart upload failed", ex), ex);
		} catch (ClientException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossClientErrorMessage("complete multipart upload failed", ex), ex);
		} finally {
			ossClient.shutdown();
		}
	}

	public boolean objectExists(String objectKey) {
		StorageProperties.Oss oss = properties.getOss();
		if (!oss.isEnabled() || isBlank(objectKey)) {
			return false;
		}
		requireOssEnabled(oss);
		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			return ossClient.doesObjectExist(oss.getBucket(), objectKey);
		} catch (OSSException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossErrorMessage("check oss object failed", ex), ex);
		} catch (ClientException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossClientErrorMessage("check oss object failed", ex), ex);
		} finally {
			ossClient.shutdown();
		}
	}

	public void abortMultipartUpload(String objectKey, String uploadId) {
		StorageProperties.Oss oss = properties.getOss();
		if (!oss.isEnabled() || isBlank(objectKey) || isBlank(uploadId)) {
			return;
		}
		requireOssEnabled(oss);
		OSS ossClient = new OSSClientBuilder().build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
		try {
			ossClient.abortMultipartUpload(new AbortMultipartUploadRequest(oss.getBucket(), objectKey, uploadId));
		} catch (OSSException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossErrorMessage("abort multipart upload failed", ex), ex);
		} catch (ClientException ex) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ossClientErrorMessage("abort multipart upload failed", ex), ex);
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

	private void requireOssEnabled(StorageProperties.Oss oss) {
		if (!oss.isEnabled()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS 未启用，请配置 MOYA_OSS_ENABLED=true");
		}
		if (isBlank(oss.getEndpoint()) || isBlank(oss.getAccessKeyId()) || isBlank(oss.getAccessKeySecret())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OSS endpoint 或访问密钥未配置");
		}
	}

	private boolean isBlank(String value) {
		return value == null || value.trim().isEmpty();
	}

	private String ossErrorMessage(String action, OSSException ex) {
		String code = ex.getErrorCode() == null ? "OSS_ERROR" : ex.getErrorCode();
		String message = ex.getErrorMessage() == null ? ex.getMessage() : ex.getErrorMessage();
		return action + ": " + code + (isBlank(message) ? "" : " - " + message);
	}

	private String ossClientErrorMessage(String action, ClientException ex) {
		String message = ex.getMessage();
		return action + ": OSS_CLIENT_ERROR" + (isBlank(message) ? "" : " - " + message);
	}

	public record MultipartUploadInit(String bucket, String objectKey, String uploadId, String contentType) {
	}
}
