package com.moya.portal.banked.verification;

public interface VerificationCodeClient {
	String send(String scene, String channel, String target);

	void verifyAndConsume(String scene, String channel, String target, String code);
}
