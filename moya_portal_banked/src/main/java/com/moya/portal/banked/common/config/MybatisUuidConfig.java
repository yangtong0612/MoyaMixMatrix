package com.moya.portal.banked.common.config;

import java.util.UUID;

import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import org.apache.ibatis.type.JdbcType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisUuidConfig {

	@Bean
	ConfigurationCustomizer postgresUuidTypeHandlerCustomizer() {
		return configuration -> {
			configuration.getTypeHandlerRegistry().register(UUID.class, PostgresUuidTypeHandler.class);
			configuration.getTypeHandlerRegistry().register(UUID.class, JdbcType.OTHER, PostgresUuidTypeHandler.class);
		};
	}
}
