package com.moya.portal.banked.common.security;

import java.time.Duration;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.moya.portal.banked.user.entity.SysUser;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTests {

	@Test
	void issueAndParseToken() {
		JwtProperties properties = new JwtProperties();
		properties.setIssuer("test-issuer");
		properties.setSecret("test-secret-test-secret-test-secret");
		properties.setTtl(Duration.ofHours(1));
		JwtService service = new JwtService(properties, new ObjectMapper());
		UUID userId = UUID.randomUUID();
		SysUser user = new SysUser();
		user.setId(userId);
		user.setUsername("alice");

		CurrentUser currentUser = service.parse(service.issue(user));

		assertThat(currentUser.id()).isEqualTo(userId);
		assertThat(currentUser.username()).isEqualTo("alice");
	}
}
