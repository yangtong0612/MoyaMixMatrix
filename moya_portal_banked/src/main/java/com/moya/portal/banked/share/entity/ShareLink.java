package com.moya.portal.banked.share.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("share_link")
public class ShareLink {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID userId;
	private UUID nodeId;
	private String shareCode;
	private String password;
	private String extractCodeHash;
	private OffsetDateTime expireAt;
	private String status;
	private Boolean allowPreview;
	private Boolean allowDownload;
	private Boolean canceled;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
