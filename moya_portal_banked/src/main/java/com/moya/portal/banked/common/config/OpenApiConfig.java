package com.moya.portal.banked.common.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

	@Bean
	OpenAPI moyaOpenApi() {
		return new OpenAPI()
				.info(new Info()
						.title("Moya Mix Matrix Drive API")
						.version("v1")
						.description("Backend APIs for Moya Mix Matrix cloud drive and media workflow."));
	}
}
