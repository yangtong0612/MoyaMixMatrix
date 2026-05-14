package com.moya.portal.banked.verification;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnMissingBean(StringRedisTemplate.class)
public class FallbackVerificationCodeClient implements VerificationCodeClient {

	private final Map<String, Entry> entries = new ConcurrentHashMap<>();
	private final VerificationProperties properties;

	public FallbackVerificationCodeClient(VerificationProperties properties) {
		this.properties = properties;
	}

	@Override
	public String send(String scene, String channel, String target) {
		String key = key(scene, channel, target);
		Entry current = entries.get(key);
		OffsetDateTime now = OffsetDateTime.now();
		if (current != null && current.sentAt.plus(properties.getSendCooldown()).isAfter(now)) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码发送过于频繁，请稍后再试");
		}
		String code = "123456";
		entries.put(key, new Entry(code, now, now.plus(properties.getTtl()), 0));
		return code;
	}

	@Override
	public void verifyAndConsume(String scene, String channel, String target, String code) {
		String key = key(scene, channel, target);
		Entry entry = entries.get(key);
		if (entry == null || entry.expiresAt.isBefore(OffsetDateTime.now())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码错误或已过期");
		}
		entry.attempts++;
		if (entry.attempts > properties.getMaxCheckAttempts()) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码错误次数过多，请重新获取");
		}
		if (!entry.code.equals(code)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码错误或已过期");
		}
		entries.remove(key);
	}

	private String key(String scene, String channel, String target) {
		return scene + ":" + channel + ":" + target;
	}

	private static class Entry {
		private final String code;
		private final OffsetDateTime sentAt;
		private final OffsetDateTime expiresAt;
		private int attempts;

		private Entry(String code, OffsetDateTime sentAt, OffsetDateTime expiresAt, int attempts) {
			this.code = code;
			this.sentAt = sentAt;
			this.expiresAt = expiresAt;
			this.attempts = attempts;
		}
	}
}
