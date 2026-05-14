package com.moya.portal.banked.user.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("sys_user")
public class SysUser {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private String username;
	private String passwordHash;
	private String email;
	private String phone;
	private String nickname;
	private String displayName;
	private String avatarUrl;
	private Long quotaTotal;
	private Long quotaUsed;
	private Integer status;
	private Boolean deleted;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
