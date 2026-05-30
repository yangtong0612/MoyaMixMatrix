package com.moya.portal.banked.user;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.user.dto.MeResponse;
import com.moya.portal.banked.user.entity.SysUser;
import com.moya.portal.banked.user.mapper.SysUserMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AuthService {

	private final SysUserMapper userMapper;

	public AuthService(SysUserMapper userMapper) {
		this.userMapper = userMapper;
	}

	public MeResponse me(UUID userId) {
		SysUser user = requireUser(userId);
		long total = nvl(user.getQuotaTotal());
		long used = nvl(user.getQuotaUsed());
		return new MeResponse(user.getId(), user.getUsername(), user.getEmail(), user.getPhone(), displayName(user), total, used, Math.max(0, total - used));
	}

	public SysUser requireUser(UUID userId) {
		SysUser user = userMapper.selectById(userId);
		if (user == null || Boolean.TRUE.equals(user.getDeleted())) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found");
		}
		return user;
	}

	public void consumeQuota(UUID userId, long bytes) {
		SysUser user = requireUser(userId);
		long total = nvl(user.getQuotaTotal());
		long used = nvl(user.getQuotaUsed());
		if (total > 0 && total - used < bytes) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "storage quota exceeded");
		}
		user.setQuotaUsed(used + bytes);
		user.setUpdatedAt(OffsetDateTime.now());
		userMapper.updateById(user);
	}

	public void releaseQuota(UUID userId, long bytes) {
		SysUser user = requireUser(userId);
		user.setQuotaUsed(Math.max(0, nvl(user.getQuotaUsed()) - bytes));
		user.setUpdatedAt(OffsetDateTime.now());
		userMapper.updateById(user);
	}

	public SysUser findReceiver(String receiver) {
		try {
			return requireUser(UUID.fromString(receiver));
		} catch (Exception ignored) {
			SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
					.eq(SysUser::getUsername, receiver)
					.or()
					.eq(SysUser::getEmail, receiver)
					.or()
					.eq(SysUser::getPhone, receiver)
					.last("limit 1"));
			if (user == null) {
				throw new ResponseStatusException(HttpStatus.NOT_FOUND, "receiver user not found");
			}
			return user;
		}
	}

	private String displayName(SysUser user) {
		if (StringUtils.hasText(user.getDisplayName())) return user.getDisplayName();
		if (StringUtils.hasText(user.getNickname())) return user.getNickname();
		return user.getUsername();
	}

	private long nvl(Long value) {
		return value == null ? 0 : value;
	}

}
