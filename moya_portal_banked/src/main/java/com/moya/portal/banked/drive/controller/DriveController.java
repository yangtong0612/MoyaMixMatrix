package com.moya.portal.banked.drive.controller;

import java.util.List;
import java.util.UUID;

import com.moya.portal.banked.common.response.ApiResponse;
import com.moya.portal.banked.drive.dto.DriveListResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive")
public class DriveController {

	@GetMapping("/nodes")
	public ApiResponse<DriveListResult> listNodes(@RequestParam(required = false) UUID parentId) {
		return ApiResponse.ok(new DriveListResult(parentId, List.of()));
	}
}
