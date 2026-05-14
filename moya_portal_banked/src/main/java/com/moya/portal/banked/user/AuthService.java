package com.moya.portal.banked.user;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.moya.portal.banked.common.security.JwtService;
import com.moya.portal.banked.user.dto.AuthTokenResponse;
import com.moya.portal.banked.user.dto.MeResponse;
import com.moya.portal.banked.user.entity.OAuthAccount;
import com.moya.portal.banked.user.entity.SysUser;
import com.moya.portal.banked.user.mapper.OAuthAccountMapper;
import com.moya.portal.banked.user.mapper.SysUserMapper;
import com.moya.portal.banked.verification.VerificationCodeClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(prefix = "moya.database", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AuthService {

	private final SysUserMapper userMapper;
	private final OAuthAccountMapper oauthAccountMapper;
	private final PasswordEncoder passwordEncoder;
	private final VerificationCodeClient verificationCodeClient;
	private final JwtService jwtService;
	private final long defaultQuotaBytes;

	public AuthService(
			SysUserMapper userMapper,
			OAuthAccountMapper oauthAccountMapper,
			PasswordEncoder passwordEncoder,
			VerificationCodeClient verificationCodeClient,
			JwtService jwtService,
			@Value("${moya.drive.default-quota-bytes}") long defaultQuotaBytes
	) {
		this.userMapper = userMapper;
		this.oauthAccountMapper = oauthAccountMapper;
		this.passwordEncoder = passwordEncoder;
		this.verificationCodeClient = verificationCodeClient;
		this.jwtService = jwtService;
		this.defaultQuotaBytes = defaultQuotaBytes;
	}

	@Transactional
	public AuthTokenResponse register(RegisterCommand command) {
		if (exists(SysUser::getUsername, command.username())) {
			throw badRequest("username already exists");
		}
		if (StringUtils.hasText(command.email()) && exists(SysUser::getEmail, command.email())) {
			throw badRequest("email already exists");
		}
		if (StringUtils.hasText(command.phone()) && exists(SysUser::getPhone, command.phone())) {
			throw badRequest("phone already exists");
		}
		if (StringUtils.hasText(command.verificationCode())) {
			verificationCodeClient.verifyAndConsume("register", command.verificationChannel(), command.verificationTarget(), command.verificationCode());
		}

		OffsetDateTime now = OffsetDateTime.now();
		SysUser user = new SysUser();
		user.setId(UUID.randomUUID());
		user.setUsername(command.username());
		user.setPasswordHash(passwordEncoder.encode(command.password()));
		user.setEmail(command.email());
		user.setPhone(command.phone());
		user.setDisplayName(StringUtils.hasText(command.displayName()) ? command.displayName() : command.username());
		user.setNickname(user.getDisplayName());
		user.setQuotaTotal(defaultQuotaBytes);
		user.setQuotaUsed(0L);
		user.setStatus(1);
		user.setDeleted(false);
		user.setCreatedAt(now);
		user.setUpdatedAt(now);
		userMapper.insert(user);
		return token(user);
	}

	public AuthTokenResponse login(LoginCommand command) {
		SysUser user = findByAccount(command.account());
		if (user.getPasswordHash() == null || !passwordEncoder.matches(command.password(), user.getPasswordHash())) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "account or password is wrong");
		}
		return token(user);
	}

	@Transactional
	public void resetPassword(ResetPasswordCommand command) {
		verificationCodeClient.verifyAndConsume("reset", command.verificationChannel(), command.verificationTarget(), command.verificationCode());
		SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
				.eq(SysUser::getEmail, command.verificationTarget())
				.or()
				.eq(SysUser::getPhone, command.verificationTarget())
				.last("limit 1"));
		if (user == null) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found");
		}
		user.setPasswordHash(passwordEncoder.encode(command.newPassword()));
		user.setUpdatedAt(OffsetDateTime.now());
		userMapper.updateById(user);
	}

	@Transactional
	public AuthTokenResponse oauthLogin(OAuthLoginCommand command) {
		OAuthAccount account = oauthAccountMapper.selectOne(new LambdaQueryWrapper<OAuthAccount>()
				.eq(OAuthAccount::getProvider, command.provider())
				.eq(OAuthAccount::getOpenid, command.openid())
				.last("limit 1"));
		if (account != null) {
			return token(requireUser(account.getUserId()));
		}

		OffsetDateTime now = OffsetDateTime.now();
		SysUser user = new SysUser();
		user.setId(UUID.randomUUID());
		user.setUsername(command.provider() + "_" + command.openid());
		user.setDisplayName(StringUtils.hasText(command.displayName()) ? command.displayName() : user.getUsername());
		user.setNickname(user.getDisplayName());
		user.setQuotaTotal(defaultQuotaBytes);
		user.setQuotaUsed(0L);
		user.setStatus(1);
		user.setDeleted(false);
		user.setCreatedAt(now);
		user.setUpdatedAt(now);
		userMapper.insert(user);

		OAuthAccount created = new OAuthAccount();
		created.setId(UUID.randomUUID());
		created.setProvider(command.provider());
		created.setOpenid(command.openid());
		created.setUnionid(command.unionid());
		created.setUserId(user.getId());
		created.setCreatedAt(now);
		oauthAccountMapper.insert(created);
		return token(user);
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

	private SysUser findByAccount(String account) {
		SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
				.eq(SysUser::getUsername, account)
				.or()
				.eq(SysUser::getEmail, account)
				.or()
				.eq(SysUser::getPhone, account)
				.last("limit 1"));
		if (user == null) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "account or password is wrong");
		}
		return user;
	}

	private AuthTokenResponse token(SysUser user) {
		return new AuthTokenResponse(jwtService.issue(user), user.getId(), user.getUsername());
	}

	private <T> boolean exists(com.baomidou.mybatisplus.core.toolkit.support.SFunction<SysUser, T> column, T value) {
		return userMapper.selectCount(new LambdaQueryWrapper<SysUser>().eq(column, value)) > 0;
	}

	private String displayName(SysUser user) {
		if (StringUtils.hasText(user.getDisplayName())) return user.getDisplayName();
		if (StringUtils.hasText(user.getNickname())) return user.getNickname();
		return user.getUsername();
	}

	private long nvl(Long value) {
		return value == null ? 0 : value;
	}

	private ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	public record RegisterCommand(String username, String password, String email, String phone, String displayName,
								  String verificationChannel, String verificationTarget, String verificationCode) {
	}

	public record LoginCommand(String account, String password) {
	}

	public record ResetPasswordCommand(String verificationChannel, String verificationTarget, String verificationCode, String newPassword) {
	}

	public record OAuthLoginCommand(String provider, String openid, String unionid, String displayName) {
	}
}
