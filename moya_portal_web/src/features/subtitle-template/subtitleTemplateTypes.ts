import type { CSSProperties } from 'react';

export type SubtitleTemplateTab = 'template' | 'captions' | 'video' | 'sound';
export type SubtitleCaptionEntrance = 'none' | 'blur-reveal' | 'fade' | 'rise' | 'pop' | 'karaoke';
export type SubtitleOpeningSoundEffect = 'none' | 'pop-soft' | 'pop-light' | 'hit-light' | 'whoosh-gentle';
export type SubtitleTransitionSoundEffect = 'none' | 'whoosh-fast' | 'whoosh-short' | 'glitch-soft' | 'glitch-sci-fi';
export type SubtitleCaptionSoundEffect = 'none' | 'soft-pop' | 'bright-ding' | 'click-clack' | 'tech-beep';
export type SubtitleCaptionSoundRhythm = 'off' | 'recommended' | 'boost' | 'all';

export interface SubtitleTemplateTextStyle {
  fontSize: number;
  fontFamily: string;
  width: number;
  height: number;
}

export interface SubtitleTemplateTheme {
  titleColor: string;
  titleStroke: string;
  captionColor: string;
  captionShadow: string;
  keywordBackground: string;
  keywordColor: string;
  accent: string;
}

export interface SubtitleTemplate {
  id: string;
  name: string;
  titleCopy: string;
  captionCopy: string;
  badgeCopy: string;
  bilingual: boolean;
  theme: SubtitleTemplateTheme;
  titlePosition: { x: number; y: number };
  captionPosition: { x: number; y: number };
  titleTextStyle: SubtitleTemplateTextStyle;
  captionTextStyle: SubtitleTemplateTextStyle;
}

export interface SubtitleTemplateCaption {
  id: string;
  start: number;
  end: number;
  text: string;
  translation?: string;
}

export interface SubtitleTemplateSoundSettings {
  videoVolume: number;
  bgmVolume: number;
  music: boolean;
  soundFx: boolean;
  openingSoundEffect: SubtitleOpeningSoundEffect;
  transitionSoundEffect: SubtitleTransitionSoundEffect;
  captionSoundEffect: SubtitleCaptionSoundEffect;
  captionSoundRhythm: SubtitleCaptionSoundRhythm;
  noiseReduction: boolean;
}

export interface SubtitleTemplateVideoZoomRange {
  id: string;
  start: number;
  end: number;
  scale: number;
}

export interface SubtitleTemplateOverlay {
  templateKey: string;
  templateName: string;
  hook: string;
  isBilingual: boolean;
  titleDuration: 'full' | number;
  theme: SubtitleTemplateTheme;
  titlePosition: { x: number; y: number };
  captionPosition: { x: number; y: number };
  titleTextStyle: SubtitleTemplateTextStyle;
  captionTextStyle: SubtitleTemplateTextStyle;
  previewVideoFit: 'cover' | 'contain' | 'fill';
  captionEntrance: SubtitleCaptionEntrance;
  openingSoundEffect: SubtitleOpeningSoundEffect;
  transitionSoundEffect: SubtitleTransitionSoundEffect;
  captionSoundEffect: SubtitleCaptionSoundEffect;
  captionSoundRhythm: SubtitleCaptionSoundRhythm;
  videoZoomRanges: SubtitleTemplateVideoZoomRange[];
  keywords: string;
  subtitleSegments: Array<{
    time: string;
    text: string;
    translation?: string;
  }>;
}

export interface SubtitleTemplateProcessingState {
  active: boolean;
  title: string;
  progress: number;
  message: string;
  cancellable: boolean;
}

export type SubtitleTemplateStyleVars = CSSProperties & Record<`--${string}`, string | number>;
