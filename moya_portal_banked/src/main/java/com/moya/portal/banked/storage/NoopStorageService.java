package com.moya.portal.banked.storage;

import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnMissingBean(StorageService.class)
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

	@Override
	public InputStream openObjectStream(String objectKey) {
		throw new UnsupportedOperationException("Noop storage cannot read objects");
	}

	@Override
	public byte[] readObject(String objectKey) {
		throw new UnsupportedOperationException("Noop storage cannot read objects");
	}

	@Override
	public void writeObject(String objectKey, byte[] bytes, String contentType) {
		throw new UnsupportedOperationException("Noop storage cannot write objects");
	}
}
