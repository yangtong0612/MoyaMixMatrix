import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { WandSparkles } from 'lucide-react';
import { formatCaptionTemplateMotionLabel, getCaptionTemplatePreviewText, type CaptionTemplatePreset } from './captionTemplates';
import './captionTemplates.css';

export function CaptionTemplateShowcase({ templates }: { templates: CaptionTemplatePreset[] }) {
  return (
    <section className="caption-template-showcase">
      <header>
        <div>
          <span>字幕 Template</span>
          <strong>独立字幕模板库，不覆盖原有网感剪辑模板</strong>
          <p>按 PupCaps/CSS overlay 思路组织，模板 ID、样式作用域和存储 key 都使用 moya-caption-template 前缀。</p>
        </div>
        <NavLink to="/editor?workflow=viral">
          <WandSparkles size={15} />
          <span>去剪辑使用</span>
        </NavLink>
      </header>
      <div className="caption-template-grid">
        {templates.map((template) => (
          <CaptionTemplateCard key={template.templateId} template={template} />
        ))}
      </div>
    </section>
  );
}

export function CaptionTemplateEmpty() {
  return (
    <div className="caption-template-empty">
      <strong>没有匹配的字幕模板</strong>
      <span>换个关键词，或切回全部查看默认 Template。</span>
    </div>
  );
}

function CaptionTemplateCard({ template }: { template: CaptionTemplatePreset }) {
  const previewText = getCaptionTemplatePreviewText(template);
  const previewStyle = {
    '--caption-template-bg': template.style.background,
    '--caption-template-color': template.style.textColor,
    '--caption-template-keyword': template.style.keywordColor,
    '--caption-template-stroke': template.style.strokeColor,
    '--caption-template-shadow': template.style.shadow,
    '--caption-template-font': template.style.fontFamily,
    '--caption-template-size': `${template.style.fontSize}px`
  } as CSSProperties;

  return (
    <article className={`caption-template-card align-${template.style.align}`}>
      <div className={`caption-template-preview ${template.cssScope} motion-${template.motion}`} style={previewStyle}>
        <div>
          <strong className="caption-template-text" aria-label={template.sample}>
            <span className="caption-template-line">
              <CaptionTemplateAnimatedText previewText={previewText} />
            </span>
            {template.motion === 'karaoke-sweep' ? (
              <span className="caption-template-line caption-template-sweep" aria-hidden="true">
                <CaptionTemplateAnimatedText previewText={previewText} />
              </span>
            ) : null}
          </strong>
          <small>{formatCaptionTemplateMotionLabel(template.motion)}</small>
        </div>
      </div>
      <div className="caption-template-meta">
        <div>
          <strong>{template.name}</strong>
          <span>{template.scene}</span>
        </div>
        <p>{template.templateId}</p>
        <div>
          {template.tags.slice(1, 4).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function CaptionTemplateAnimatedText({
  previewText
}: {
  previewText: ReturnType<typeof getCaptionTemplatePreviewText>;
}) {
  let charIndex = 0;
  const renderChars = (value: string, keyPrefix: string) =>
    Array.from(value).map((char, index) => {
      const style = {
        '--caption-char-index': charIndex,
        '--caption-char-delay': `${charIndex * 70}ms`
      } as CSSProperties;
      charIndex += 1;
      return (
        <span key={`${keyPrefix}-${index}`} className="caption-template-char" style={style}>
          {char}
        </span>
      );
    });

  return (
    <>
      {renderChars(previewText.before, 'before')}
      {previewText.keyword ? <mark>{renderChars(previewText.keyword, 'keyword')}</mark> : null}
      {renderChars(previewText.after, 'after')}
    </>
  );
}
