package com.moya.portal.banked.verification;

import java.security.SecureRandom;
import java.util.Locale;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnBean(StringRedisTemplate.class)
public class RedisVerificationCodeClient implements VerificationCodeClient {

	private final StringRedisTemplate redisTemplate;
	private final VerificationProperties properties;
	private final SecureRandom random = new SecureRandom();

	public RedisVerificationCodeClient(StringRedisTemplate redisTemplate, VerificationProperties properties) {
		this.redisTemplate = redisTemplate;
		this.properties = properties;
	}

	@Override
	public String send(String scene, String channel, String target) {
		String normalized = normalize(scene, channel, target);
		String cooldownKey = "moya:verification:cooldown:" + normalized;
		Boolean accepted = redisTemplate.opsForValue().setIfAbsent(cooldownKey, "1", properties.getSendCooldown());
		if (!Boolean.TRUE.equals(accepted)) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码发送过于频繁，请稍后再试");
		}
		String code = "%06d".formatted(random.nextInt(1_000_000));
		redisTemplate.opsForValue().set(codeKey(normalized), code, properties.getTtl());
		redisTemplate.delete(attemptKey(normalized));
		return code;
	}

	@Override
	public void verifyAndConsume(String scene, String channel, String target, String code) {
		String normalized = normalize(scene, channel, target);
		String attemptKey = attemptKey(normalized);
		Long attempts = redisTemplate.opsForValue().increment(attemptKey);
		if (attempts != null && attempts == 1) {
			redisTemplate.expire(attemptKey, properties.getTtl());
		}
		if (attempts != null && attempts > properties.getMaxCheckAttempts()) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码错误次数过多，请重新获取");
		}
		String key = codeKey(normalized);
		String expected = redisTemplate.opsForValue().get(key);
		if (expected == null || !expected.equals(code)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码错误或已过期");
		}
		redisTemplate.delete(key);
		redisTemplate.delete(attemptKey);
	}

	private String codeKey(String normalized) {
		return "moya:verification:code:" + normalized;
	}

	private String attemptKey(String normalized) {
		return "moya:verification:attempt:" + normalized;
	}

	private String normalize(String scene, String channel, String target) {
		return (clean(scene) + ":" + clean(channel) + ":" + clean(target)).toLowerCase(Locale.ROOT);
	}

	private String clean(String value) {
		if (value == null || value.isBlank()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码参数不能为空");
		}
		return value.trim();
	}
}
