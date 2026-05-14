package com.moya.portal.banked.share.entity;

import java.util.UUID;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("share_item")
public class ShareItem {
	@TableId(type = IdType.INPUT)
	private UUID id;
	private UUID shareLinkId;
	private UUID nodeId;
}
