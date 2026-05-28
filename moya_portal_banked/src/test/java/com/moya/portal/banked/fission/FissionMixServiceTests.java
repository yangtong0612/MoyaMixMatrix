package com.moya.portal.banked.fission;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.moya.portal.banked.fission.dto.FissionMixRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FissionMixServiceTests {

	@Test
	void buildTimeline_prefersAiVoiceForDigitalHumanSegments() {
		FissionMixService service = new FissionMixService(new AliyunIceProperties(), new ObjectMapper());
		FissionMixRequest.AudioAsset aiVoice = new FissionMixRequest.AudioAsset(
				"audio-ai",
				"scene01_v2_ai_voice",
				"4.80s",
				100,
				"https://example.com/scene01_v2_ai.mp3",
				"ai_voice",
				"scene01 v2 ai voice",
				null,
				null,
				null
		);
		FissionMixRequest request = new FissionMixRequest(
				List.of(
						new FissionMixRequest.ShotGroup(
								"group-1",
								1,
								"数字人口播段",
								"5.00s",
								"数字人出镜讲解产品卖点",
								"请看这里的核心亮点。",
								"digital_human",
								List.of(
										new FissionMixRequest.VideoAsset("clip-1", "scene01_v1", "5.00s", "https://example.com/scene01_v1.mp4", "scene01 v1"),
										new FissionMixRequest.VideoAsset("clip-2", "scene01_v2", "5.00s", "https://example.com/scene01_v2.mp4", "scene01 v2")
								),
								List.of(aiVoice)
						)
				),
				List.of(
				),
				List.of(
						new FissionMixRequest.AudioAsset("audio-bgm", "bgm_opening", "5.00s", 100, "https://example.com/bgm_opening.mp3", "music", "bgm opening", null, null, null)
				),
				new FissionMixRequest.MixSettings(true, true, true, true, 100, false, 720, 1280, 6000),
				1,
				"https://example.com/output.mp4",
				true
		);

		JsonNode timeline = service.buildTimeline(request);
		JsonNode videoClip = timeline.path("VideoTracks").get(0).path("VideoTrackClips").get(0);
		JsonNode audioClip = timeline.path("AudioTracks").get(0).path("AudioTrackClips").get(0);
		JsonNode bgmClip = timeline.path("AudioTracks").get(1).path("AudioTrackClips").get(0);

		assertEquals("https://example.com/scene01_v2.mp4", videoClip.path("MediaURL").asText());
		assertEquals("https://example.com/scene01_v2_ai.mp3", audioClip.path("MediaURL").asText());
		assertEquals("https://example.com/bgm_opening.mp3", bgmClip.path("MediaURL").asText());
		assertEquals(0.0, videoClip.path("Effects").get(0).path("Gain").asDouble());
		assertTrue(audioClip.path("TimelineOut").asDouble() <= videoClip.path("TimelineOut").asDouble());
	}

	@Test
	void buildTimeline_rotatesUploadedGroupAudiosAcrossVariants() {
		FissionMixService service = new FissionMixService(new AliyunIceProperties(), new ObjectMapper());
		List<FissionMixRequest.VideoAsset> clips = List.of(
				new FissionMixRequest.VideoAsset("clip-1", "scene02", "5.00s", "https://example.com/scene02.mp4", "scene02")
		);
		List<FissionMixRequest.AudioAsset> groupAudios = List.of(
				new FissionMixRequest.AudioAsset("audio-1", "scene02_v1", "5.00s", 100, "https://example.com/scene02_v1.mp3", "voice", "scene02 v1", null, null, null),
				new FissionMixRequest.AudioAsset("audio-2", "scene02_v2", "5.00s", 100, "https://example.com/scene02_v2.mp3", "voice", "scene02 v2", null, null, null),
				new FissionMixRequest.AudioAsset("audio-3", "scene02_v3", "5.00s", 100, "https://example.com/scene02_v3.mp3", "voice", "scene02 v3", null, null, null)
		);

		for (int variantIndex = 0; variantIndex < groupAudios.size(); variantIndex++) {
			FissionMixRequest request = new FissionMixRequest(
					List.of(
							new FissionMixRequest.ShotGroup(
									"group-2",
									2,
									"口播分镜",
									"5.00s",
									"人物稳定讲解",
									"这是第 " + (variantIndex + 1) + " 条口播。",
									"digital_human",
									clips,
									groupAudios
							)
					),
					List.of(),
					List.of(),
					new FissionMixRequest.MixSettings(true, true, true, true, 100, false, 720, 1280, 6000),
					variantIndex,
					"https://example.com/output-" + variantIndex + ".mp4",
					true
			);

			JsonNode timeline = service.buildTimeline(request);
			JsonNode audioClip = timeline.path("AudioTracks").get(0).path("AudioTrackClips").get(0);
			assertEquals("https://example.com/scene02_v" + (variantIndex + 1) + ".mp3", audioClip.path("MediaURL").asText());
		}
	}

	@Test
	void buildTimeline_addsCropEffectWhenSubtitleMaskEnabled() {
		FissionMixService service = new FissionMixService(new AliyunIceProperties(), new ObjectMapper());
		FissionMixRequest request = new FissionMixRequest(
				List.of(
						new FissionMixRequest.ShotGroup(
								"group-3",
								3,
								"门店字幕分镜",
								"4.00s",
								"底部有原片字幕",
								"先把底部字幕挡掉。",
								"standard",
								List.of(
										new FissionMixRequest.VideoAsset("clip-3", "scene03", "4.00s", "https://example.com/scene03.mp4", "scene03")
								),
								List.of()
						)
				),
				List.of(),
				List.of(),
				new FissionMixRequest.MixSettings(true, true, true, true, 100, true, 720, 1280, 6000),
				0,
				"https://example.com/output-mask.mp4",
				true
		);

		JsonNode timeline = service.buildTimeline(request);
		JsonNode cropEffect = timeline.path("VideoTracks").get(0).path("VideoTrackClips").get(0).path("Effects").get(0);

		assertEquals("Crop", cropEffect.path("Type").asText());
		assertEquals(0.86, cropEffect.path("Height").asDouble(), 0.0001);
	}
}
