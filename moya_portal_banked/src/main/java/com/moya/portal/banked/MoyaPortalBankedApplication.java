package com.moya.portal.banked;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class MoyaPortalBankedApplication {

	public static void main(String[] args) {
		SpringApplication.run(MoyaPortalBankedApplication.class, args);
	}

}
