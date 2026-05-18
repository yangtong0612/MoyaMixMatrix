package com.moya.portal.banked.storage;

import java.io.ByteArrayInputStream;
import java.net.URL;
import java.time.Duration;
import java.util.Date;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.OSSObject;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

@Service
@ConditionalOnProperty(prefix = "moya.storage.oss", name = "enabled", havingValue = "true")
public class OssStorageService implements StorageService {

	private final StorageProperties properties;

	public OssStorageService(StorageProperties properties) {
		this.properties = properties;
	}

	@Override
	public String provider() {
		return "aliyun-oss";
	}

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public URL createDownloadUrl(String objectKey, Duration ttl) {
		StorageProperties.Oss ossProperties = properties.getOss();
		OSS ossClient = new OSSClientBuilder().build(
				ossProperties.getEndpoint(),
				ossProperties.getAccessKeyId(),
				ossProperties.getAccessKeySecret()
		);
		try {
			Date expiration = new Date(System.currentTimeMillis() + ttl.toMillis());
			return ossClient.generatePresignedUrl(ossProperties.getBucket(), objectKey, expiration);
		} finally {
			ossClient.shutdown();
		}
	}

	@Override
	public byte[] readObject(String objectKey) {
		StorageProperties.Oss ossProperties = properties.getOss();
		OSS ossClient = new OSSClientBuilder().build(
				ossProperties.getEndpoint(),
				ossProperties.getAccessKeyId(),
				ossProperties.getAccessKeySecret()
		);
		try (OSSObject object = ossClient.getObject(ossProperties.getBucket(), objectKey)) {
			return StreamUtils.copyToByteArray(object.getObjectContent());
		} catch (Exception ex) {
			throw new IllegalStateException("Failed to read OSS object: " + objectKey, ex);
		} finally {
			ossClient.shutdown();
		}
	}

	@Override
	public void writeObject(String objectKey, byte[] bytes, String contentType) {
		StorageProperties.Oss ossProperties = properties.getOss();
		OSS ossClient = new OSSClientBuilder().build(
				ossProperties.getEndpoint(),
				ossProperties.getAccessKeyId(),
				ossProperties.getAccessKeySecret()
		);
		try {
			ObjectMetadata metadata = new ObjectMetadata();
			metadata.setContentLength(bytes.length);
			metadata.setContentType(contentType);
			ossClient.putObject(ossProperties.getBucket(), objectKey, new ByteArrayInputStream(bytes), metadata);
		} finally {
			ossClient.shutdown();
		}
	}
}
