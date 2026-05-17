package com.moya.portal.banked.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "moya.storage")
public class StorageProperties {

	private Oss oss = new Oss();

	public Oss getOss() {
		return oss;
	}

	public void setOss(Oss oss) {
		this.oss = oss;
	}

	public static class Oss {
		private boolean enabled;
		private String endpoint = "";
		private String bucket = "moya-mix-matrix";
		private String accessKeyId = "";
		private String accessKeySecret = "";
		private String rootPrefix = "moya-drive";
		private String outputPrefix = "moya-drive/fission/outputs";

		public boolean isEnabled() {
			return enabled || hasCompleteConfig();
		}

		public void setEnabled(boolean enabled) {
			this.enabled = enabled;
		}

		public boolean isExplicitlyEnabled() {
			return enabled;
		}

		public boolean hasCompleteConfig() {
			return !isBlank(endpoint) && !isBlank(bucket) && !isBlank(accessKeyId) && !isBlank(accessKeySecret);
		}

		public String missingConfigMessage() {
			StringBuilder message = new StringBuilder();
			appendMissing(message, "endpoint", endpoint);
			appendMissing(message, "bucket", bucket);
			appendMissing(message, "accessKeyId", accessKeyId);
			appendMissing(message, "accessKeySecret", accessKeySecret);
			if (message.isEmpty()) {
				return "";
			}
			return message.toString();
		}

		public String getEndpoint() {
			return endpoint;
		}

		public void setEndpoint(String endpoint) {
			this.endpoint = endpoint;
		}

		public String getBucket() {
			return bucket;
		}

		public void setBucket(String bucket) {
			this.bucket = bucket;
		}

		public String getAccessKeyId() {
			return accessKeyId;
		}

		public void setAccessKeyId(String accessKeyId) {
			this.accessKeyId = accessKeyId;
		}

		public String getAccessKeySecret() {
			return accessKeySecret;
		}

		public void setAccessKeySecret(String accessKeySecret) {
			this.accessKeySecret = accessKeySecret;
		}

		public String getRootPrefix() {
			return rootPrefix;
		}

		public void setRootPrefix(String rootPrefix) {
			this.rootPrefix = rootPrefix;
		}

		public String getOutputPrefix() {
			return outputPrefix;
		}

		public void setOutputPrefix(String outputPrefix) {
			this.outputPrefix = outputPrefix;
		}

		private void appendMissing(StringBuilder message, String label, String value) {
			if (!isBlank(value)) return;
			if (!message.isEmpty()) message.append(", ");
			message.append(label);
		}

		private boolean isBlank(String value) {
			return value == null || value.trim().isEmpty();
		}
	}
}
