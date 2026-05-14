package com.moya.portal.banked.user.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("oauth_account")
public class OAuthAccount {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private String provider;
	private String openid;
	private String unionid;
	private UUID userId;
	private OffsetDateTime createdAt;
}
