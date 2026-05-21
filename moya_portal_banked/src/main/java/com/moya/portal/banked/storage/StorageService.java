package com.moya.portal.banked.storage;

import java.io.InputStream;
import java.net.URL;
import java.time.Duration;

public interface StorageService {

	String provider();

	boolean enabled();

	URL createDownloadUrl(String objectKey, Duration ttl);

	InputStream openObjectStream(String objectKey);

	byte[] readObject(String objectKey);

	void writeObject(String objectKey, byte[] bytes, String contentType);
}
