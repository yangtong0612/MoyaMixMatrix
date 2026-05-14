package com.moya.portal.banked.share.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("direct_share")
public class DirectShare {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID senderId;
	private UUID receiverId;
	private UUID nodeId;
	private String status;
	private Boolean saved;
	private Boolean canceled;
	private OffsetDateTime createdAt;
	private OffsetDateTime updatedAt;
}
