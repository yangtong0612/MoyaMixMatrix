package com.moya.portal.banked.storage;

import java.net.URL;
import java.time.Duration;

public interface StorageService {

	String provider();

	boolean enabled();

	URL createDownloadUrl(String objectKey, Duration ttl);
}
