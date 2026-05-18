package com.moya.portal.banked.common.security;

import java.util.Map;
import java.util.UUID;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.user.entity.SysUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = {
				"spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration,org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration",
				"moya.database.enabled=false",
				"moya.storage.oss.enabled=false"
		}
)
class SecurityConfigTests {

	@LocalServerPort
	private int port;

	@Autowired
	private TestRestTemplate restTemplate;

	@Autowired
	private JwtService jwtService;

	@Test
	void protectedDriveEndpointRequiresAuthentication() {
		ResponseEntity<String> response = restTemplate.getForEntity(url("/api/drive/nodes"), String.class);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void protectedDriveEndpointAcceptsBearerToken() {
		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(issueToken());

		ResponseEntity<String> response = restTemplate.exchange(
				url("/api/drive/nodes"),
				org.springframework.http.HttpMethod.GET,
				new HttpEntity<>(headers),
				String.class
		);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(response.getBody()).contains("\"success\":true").contains("\"status\":\"entered\"");
	}

	@Test
	void publicVerificationEndpointDoesNotRequireAuthentication() {
		ResponseEntity<String> response = restTemplate.postForEntity(
				url("/api/verification/send"),
				Map.of("scene", "register", "channel", "email", "target", "a@example.com"),
				String.class
		);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(response.getBody()).contains("\"success\":true");
	}

	private String issueToken() {
		SysUser user = new SysUser();
		user.setId(UUID.randomUUID());
		user.setUsername("security-test-user");
		return jwtService.issue(user);
	}

	private String url(String path) {
		return "http://localhost:" + port + path;
	}

	@TestConfiguration
	static class TestControllerConfiguration {

		@Bean
		SecurityProbeController securityProbeController() {
			return new SecurityProbeController();
		}
	}

	@RestController
	@RequestMapping("/api/drive")
	static class SecurityProbeController {

		@GetMapping("/nodes")
		ApiResponse<Map<String, String>> nodes(@org.springframework.security.core.annotation.AuthenticationPrincipal CurrentUser currentUser) {
			return ApiResponse.ok(Map.of("status", currentUser == null ? "missing" : "entered"));
		}
	}
}
