package com.moya.portal.banked.common.response;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(ResponseStatusException.class)
	public ResponseEntity<ApiResponse<Void>> handleResponseStatusException(ResponseStatusException exception) {
		HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
		String code = status == null ? "ERROR" : status.name();
		return ResponseEntity
				.status(exception.getStatusCode())
				.body(ApiResponse.fail(code, exception.getReason() == null ? exception.getMessage() : exception.getReason()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException exception) {
		String message = exception.getBindingResult().getFieldErrors().stream()
				.findFirst()
				.map(error -> error.getField() + " " + error.getDefaultMessage())
				.orElse("请求参数校验失败");
		return ResponseEntity.badRequest().body(ApiResponse.fail("BAD_REQUEST", message));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiResponse<Void>> handleException(Exception exception) {
		return ResponseEntity
				.status(HttpStatus.INTERNAL_SERVER_ERROR)
				.body(ApiResponse.fail("INTERNAL_SERVER_ERROR", exception.getMessage() == null ? "服务异常" : exception.getMessage()));
	}
}
