package com.moya.portal.banked.common.response;

import java.time.OffsetDateTime;

public record ApiResponse<T>(
		boolean success,
		String code,
		String message,
		T data,
		OffsetDateTime timestamp
) {

	public static <T> ApiResponse<T> ok(T data) {
		return new ApiResponse<>(true, "OK", "success", data, OffsetDateTime.now());
	}

	public static <T> ApiResponse<T> fail(String code, String message) {
		return new ApiResponse<>(false, code, message, null, OffsetDateTime.now());
	}
}
