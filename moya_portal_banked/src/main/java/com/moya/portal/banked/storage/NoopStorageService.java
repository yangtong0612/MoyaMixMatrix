package com.moya.portal.banked.storage;

import java.net.MalformedURLException;
import java.net.URL;
import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(prefix = "moya.storage.oss", name = "enabled", havingValue = "false", matchIfMissing = true)
public class NoopStorageService implements StorageService {

	@Override
	public String provider() {
		return "noop";
	}

	@Override
	public boolean enabled() {
		return false;
	}

	@Override
	public URL createDownloadUrl(String objectKey, Duration ttl) {
		try {
			return new URL("https://oss.local.invalid/" + objectKey);
		} catch (MalformedURLException ex) {
			throw new IllegalArgumentException("Invalid object key: " + objectKey, ex);
		}
	}
}
