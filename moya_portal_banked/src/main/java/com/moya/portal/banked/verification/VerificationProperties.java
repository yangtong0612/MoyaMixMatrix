package com.moya.portal.banked.verification;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "moya.verification")
public class VerificationProperties {
	private Duration ttl = Duration.ofMinutes(5);
	private Duration sendCooldown = Duration.ofMinutes(1);
	private int maxCheckAttempts = 5;

	public Duration getTtl() {
		return ttl;
	}

	public void setTtl(Duration ttl) {
		this.ttl = ttl;
	}

	public Duration getSendCooldown() {
		return sendCooldown;
	}

	public void setSendCooldown(Duration sendCooldown) {
		this.sendCooldown = sendCooldown;
	}

	public int getMaxCheckAttempts() {
		return maxCheckAttempts;
	}

	public void setMaxCheckAttempts(int maxCheckAttempts) {
		this.maxCheckAttempts = maxCheckAttempts;
	}
}
