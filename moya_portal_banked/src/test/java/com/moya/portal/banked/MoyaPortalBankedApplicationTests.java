package com.moya.portal.banked;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = {
				"spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration,org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration",
				"moya.storage.oss.enabled=false"
		}
)
class MoyaPortalBankedApplicationTests {

	@LocalServerPort
	private int port;

	@Autowired
	private TestRestTemplate restTemplate;

	@Test
	void contextLoads() {
		assertThat(port).isPositive();
	}

	@Test
	void healthEndpointReturnsApplicationStatus() {
		String body = restTemplate.getForObject("/api/system/health", String.class);

		assertThat(body)
				.contains("\"success\":true")
				.contains("\"application\":\"moya-portal-banked\"")
				.contains("\"status\":\"UP\"")
				.contains("\"storageProvider\":\"noop\"");
	}

}
