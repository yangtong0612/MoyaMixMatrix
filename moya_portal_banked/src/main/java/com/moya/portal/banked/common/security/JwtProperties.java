package com.moya.portal.banked.common.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "moya.auth.jwt")
public class JwtProperties {

	private String issuer = "moya-portal-banked";
	private String secret = "change-me-change-me-change-me-change-me";
	private Duration ttl = Duration.ofHours(2);

	public String getIssuer() {
		return issuer;
	}

	public void setIssuer(String issuer) {
		this.issuer = issuer;
	}

	public String getSecret() {
		return secret;
	}

	public void setSecret(String secret) {
		this.secret = secret;
	}

	public Duration getTtl() {
		return ttl;
	}

	public void setTtl(Duration ttl) {
		this.ttl = ttl;
	}
}
