package com.moya.portal.banked.drive.controller;

import java.io.ByteArrayInputStream;
import java.util.UUID;

import com.moya.portal.banked.common.security.CurrentUser;
import com.moya.portal.banked.drive.DriveService;
import com.moya.portal.banked.drive.dto.DriveNodeContent;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DriveControllerTests {

	private final DriveService driveService = mock(DriveService.class);
	private final DriveController controller = new DriveController(driveService);

	@Test
	void contentUsesInlineDispositionAndPdfMediaType() {
		UUID userId = UUID.randomUUID();
		UUID nodeId = UUID.randomUUID();
		when(driveService.openContent(userId, nodeId)).thenReturn(new DriveNodeContent(
				"report.pdf",
				"application/pdf",
				3L,
				new ByteArrayInputStream(new byte[] { 1, 2, 3 })
		));

		var response = controller.content(new CurrentUser(userId, "tester"), nodeId);

		assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
		assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
		assertThat(response.getHeaders().getContentLength()).isEqualTo(3L);
		assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("inline").contains("report.pdf");
	}
}
