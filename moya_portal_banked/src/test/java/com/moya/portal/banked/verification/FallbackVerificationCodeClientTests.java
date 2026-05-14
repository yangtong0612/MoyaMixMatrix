package com.moya.portal.banked.verification;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FallbackVerificationCodeClientTests {

	@Test
	void verificationCodeCanOnlyBeConsumedOnce() {
		FallbackVerificationCodeClient client = new FallbackVerificationCodeClient(properties(Duration.ZERO, 5));

		String code = client.send("register", "email", "a@example.com");
		client.verifyAndConsume("register", "email", "a@example.com", code);

		assertThat(code).isEqualTo("123456");
		assertThatThrownBy(() -> client.verifyAndConsume("register", "email", "a@example.com", code))
				.isInstanceOf(ResponseStatusException.class);
	}

	@Test
	void repeatedSendWithinCooldownIsRejected() {
		FallbackVerificationCodeClient client = new FallbackVerificationCodeClient(properties(Duration.ofMinutes(1), 5));

		client.send("register", "phone", "13800000000");

		assertThatThrownBy(() -> client.send("register", "phone", "13800000000"))
				.isInstanceOf(ResponseStatusException.class);
	}

	private VerificationProperties properties(Duration cooldown, int maxAttempts) {
		VerificationProperties properties = new VerificationProperties();
		properties.setTtl(Duration.ofMinutes(5));
		properties.setSendCooldown(cooldown);
		properties.setMaxCheckAttempts(maxAttempts);
		return properties;
	}
}
