package com.moya.portal.banked.common.security;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.user.entity.SysUser;
import com.moya.portal.banked.user.mapper.SysUserMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class LocalDriveUserService {

	private static final UUID LOCAL_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
	private static final String LOCAL_USERNAME = "local_drive";
	private static final String LOCAL_DISPLAY_NAME = "本地网盘";

	private final SysUserMapper userMapper;
	private final PasswordEncoder passwordEncoder;
	private final long defaultQuotaBytes;

	public LocalDriveUserService(
			SysUserMapper userMapper,
			PasswordEncoder passwordEncoder,
			@Value("${moya.drive.default-quota-bytes}") long defaultQuotaBytes
	) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
		this.defaultQuotaBytes = defaultQuotaBytes;
	}

	@Transactional
	public synchronized CurrentUser currentUser() {
		SysUser user = findLocalUser();
		if (user == null) {
			user = createLocalUser();
		}
		return new CurrentUser(user.getId(), user.getUsername());
	}

	private SysUser findLocalUser() {
		SysUser user = userMapper.selectById(LOCAL_USER_ID);
		if (isActive(user)) return user;
		user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
				.eq(SysUser::getUsername, LOCAL_USERNAME)
				.last("limit 1"));
		if (isActive(user)) return user;
		return null;
	}

	private SysUser createLocalUser() {
		SysUser user = buildLocalUser();
		try {
			userMapper.insert(user);
			return user;
		} catch (DuplicateKeyException ignored) {
			SysUser existing = findLocalUser();
			if (existing != null) return existing;
			throw ignored;
		}
	}

	private SysUser buildLocalUser() {
		OffsetDateTime now = OffsetDateTime.now();
		SysUser user = new SysUser();
		user.setId(LOCAL_USER_ID);
		user.setUsername(LOCAL_USERNAME);
		user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
		user.setNickname(LOCAL_DISPLAY_NAME);
		user.setDisplayName(LOCAL_DISPLAY_NAME);
		user.setQuotaTotal(defaultQuotaBytes);
		user.setQuotaUsed(0L);
		user.setStatus(1);
		user.setDeleted(false);
		user.setCreatedAt(now);
		user.setUpdatedAt(now);
		return user;
	}

	private boolean isActive(SysUser user) {
		return user != null && !Boolean.TRUE.equals(user.getDeleted());
	}
}
