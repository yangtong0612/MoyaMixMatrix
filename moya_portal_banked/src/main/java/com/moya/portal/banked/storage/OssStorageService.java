package com.moya.portal.banked.storage;

import java.net.URL;
import java.time.Duration;
import java.util.Date;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

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
}
