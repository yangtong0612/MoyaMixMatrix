package com.moya.portal.banked.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.moya.portal.banked.user.entity.OAuthAccount;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OAuthAccountMapper extends BaseMapper<OAuthAccount> {
}
