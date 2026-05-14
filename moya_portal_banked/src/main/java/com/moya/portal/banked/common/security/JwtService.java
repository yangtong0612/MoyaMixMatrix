package com.moya.portal.banked.common.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.moya.portal.banked.user.entity.SysUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JwtService {

	private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
	private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

	private final JwtProperties properties;
	private final ObjectMapper objectMapper;

	public JwtService(JwtProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	public String issue(SysUser user) {
		try {
			Instant now = Instant.now();
			Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
			Map<String, Object> claims = new LinkedHashMap<>();
			claims.put("iss", properties.getIssuer());
			claims.put("sub", user.getId().toString());
			claims.put("username", user.getUsername());
			claims.put("iat", now.getEpochSecond());
			claims.put("exp", now.plus(properties.getTtl()).getEpochSecond());
			String unsigned = encode(header) + "." + encode(claims);
			return unsigned + "." + sign(unsigned);
		} catch (Exception ex) {
			throw new IllegalStateException("failed to issue token", ex);
		}
	}

	public CurrentUser parse(String token) {
		try {
			String[] parts = token.split("\\.");
			if (parts.length != 3) {
				throw unauthorized("invalid token");
			}
			String unsigned = parts[0] + "." + parts[1];
			if (!MessageDigest.isEqual(sign(unsigned).getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8))) {
				throw unauthorized("invalid token signature");
			}
			Map<String, Object> claims = objectMapper.readValue(DECODER.decode(parts[1]), new TypeReference<>() {
			});
			if (!properties.getIssuer().equals(claims.get("iss"))) {
				throw unauthorized("invalid token issuer");
			}
			long exp = ((Number) claims.get("exp")).longValue();
			if (Instant.now().getEpochSecond() >= exp) {
				throw unauthorized("token expired");
			}
			return new CurrentUser(UUID.fromString(claims.get("sub").toString()), claims.get("username").toString());
		} catch (ResponseStatusException ex) {
			throw ex;
		} catch (Exception ex) {
			throw unauthorized("invalid token");
		}
	}

	private String encode(Map<String, Object> value) throws Exception {
		return ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
	}

	private String sign(String unsigned) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(properties.getSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		return ENCODER.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
	}

	private ResponseStatusException unauthorized(String message) {
		return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message);
	}
}
