import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, File, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/pdf';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import mammoth from 'mammoth/mammoth.browser';
import * as XLSX from 'xlsx';
import { buildDriveContentUrl, type DriveNodeView } from '../api/netdisk';
import { formatSize } from './CloudFileTable';

(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

const pdfLoadTimeoutMs = 15000;

type PreviewKind = 'pdf' | 'text' | 'docx' | 'xlsx' | 'unsupported';
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; buffer: ArrayBuffer; text?: string; workbook?: WorkbookPreview }
  | { status: 'error'; message: string };

interface WorkbookPreview {
  sheets: Array<{
    name: string;
    rows: string[][];
  }>;
}

interface DocumentPreviewProps {
  node: DriveNodeView;
  onDownload: (node: DriveNodeView) => void;
}

export function DocumentPreview({ node, onDownload }: DocumentPreviewProps) {
  const kind = useMemo(() => previewKind(node), [node]);
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    let canceled = false;
    if (kind === 'unsupported') {
      setState({ status: 'idle' });
      return undefined;
    }
    setState({ status: 'loading' });
    fetchDriveContent(node)
      .then(async (buffer) => {
        if (canceled) return;
        if (kind === 'text') {
          setState({ status: 'ready', buffer, text: decodeText(buffer) });
          return;
        }
        if (kind === 'docx') {
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          if (!canceled) setState({ status: 'ready', buffer, text: result.value.trim() || '文档中没有可显示的文本内容。' });
          return;
        }
        if (kind === 'xlsx') {
          setState({ status: 'ready', buffer, workbook: readWorkbook(buffer) });
          return;
        }
        if (kind === 'pdf' && !looksLikePdf(buffer)) {
          throw new Error('返回内容不是 PDF 文件');
        }
        setState({ status: 'ready', buffer });
      })
      .catch((error) => {
        if (!canceled) setState({ status: 'error', message: error instanceof Error ? error.message : '文档加载失败' });
      });
    return () => {
      canceled = true;
    };
  }, [kind, node.id]);

  if (kind === 'unsupported') {
    return <UnsupportedPreview node={node} onDownload={onDownload} />;
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="document-preview-status">
        <FileText size={26} />
        <span>正在加载文档...</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="document-preview-status">
        <File size={26} />
        <strong>预览失败</strong>
        <span>{state.message}</span>
        <button type="button" onClick={() => onDownload(node)}>
          <Download size={16} />
          下载查看
        </button>
      </div>
    );
  }

  const readyState = state;
  if (kind === 'pdf') return <PdfPreview buffer={readyState.buffer} />;
  if (kind === 'xlsx') return <WorkbookPreviewView workbook={readyState.workbook} />;
  return <TextPreview text={readyState.text || ''} />;
}

function PdfPreview({ buffer }: { buffer: ArrayBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'parsing' | 'rendering' | 'ready'>('parsing');

  useEffect(() => {
    let canceled = false;
    let timedOut = false;
    const startedAt = performance.now();
    setPdf(null);
    setError('');
    setPageNumber(1);
    setPhase('parsing');
    logPdfDebug('start parsing', { bytes: buffer.byteLength });
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      disableFontFace: true,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: false,
      useSystemFonts: true,
      useWorkerFetch: false,
      useWasm: false
    });
    const timeoutId = window.setTimeout(() => {
      if (canceled) return;
      timedOut = true;
      setError('PDF parse timed out. Please download the file to view it.');
      loadingTask.destroy();
      logPdfDebug('parse timeout', { timeoutMs: pdfLoadTimeoutMs, bytes: buffer.byteLength });
    }, pdfLoadTimeoutMs);
    loadingTask.promise
      .then((document) => {
        window.clearTimeout(timeoutId);
        if (!canceled) {
          logPdfDebug('parse complete', {
            bytes: buffer.byteLength,
            pages: document.numPages,
            ms: Math.round(performance.now() - startedAt)
          });
          setPdf(document);
          setPageNumber(1);
          setPhase('rendering');
        } else {
          document.destroy();
        }
      })
      .catch((loadError) => {
        window.clearTimeout(timeoutId);
        if (!canceled && !timedOut) {
          logPdfDebug('parse failed', { reason: String(loadError) });
          setError(loadError instanceof Error ? loadError.message : 'PDF load failed');
        }
      });
    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
      loadingTask.destroy();
    };
  }, [buffer]);

  useEffect(() => {
    let canceled = false;
    if (!pdf || !canvasRef.current) return undefined;
    renderTaskRef.current?.cancel();
    setPhase('rendering');
    pdf.getPage(pageNumber).then((page) => {
      if (canceled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const renderTask = page.render({ canvas, canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      renderTask.promise
        .then(() => {
          if (!canceled) {
            setPhase('ready');
            logPdfDebug('page rendered', { pageNumber, scale, width: canvas.width, height: canvas.height });
          }
        })
        .catch((renderError) => {
          if (!/cancel/i.test(String(renderError))) {
            logPdfDebug('render failed', { reason: String(renderError) });
            setError(renderError instanceof Error ? renderError.message : 'PDF render failed');
          }
        });
    });
    return () => {
      canceled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  if (error) {
    return (
      <div className="document-preview-status">
        <File size={26} />
        <strong>PDF 预览失败</strong>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="pdf-preview">
      <div className="document-preview-toolbar">
        <button type="button" disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>
          <ChevronLeft size={16} />
        </button>
        <span>{pdf ? `${pageNumber} / ${pdf.numPages}` : phase === 'parsing' ? '正在解析' : '加载中'}</span>
        <button type="button" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber((value) => Math.min(pdf?.numPages || value, value + 1))}>
          <ChevronRight size={16} />
        </button>
        <button type="button" onClick={() => setScale((value) => Math.max(0.6, Number((value - 0.1).toFixed(1))))}>
          <ZoomOut size={16} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((value) => Math.min(2, Number((value + 0.1).toFixed(1))))}>
          <ZoomIn size={16} />
        </button>
      </div>
      <div className="pdf-canvas-shell">
        {!pdf ? (
          <div className="document-preview-status pdf-inline-status">
            <FileText size={26} />
            <span>正在解析 PDF...</span>
          </div>
        ) : null}
        <canvas ref={canvasRef} hidden={!pdf} />
      </div>
    </div>
  );
}

function TextPreview({ text }: { text: string }) {
  return (
    <pre className="text-document-preview">
      {text || '文档中没有可显示的文本内容。'}
    </pre>
  );
}

function WorkbookPreviewView({ workbook }: { workbook?: WorkbookPreview }) {
  if (!workbook?.sheets.length) {
    return (
      <div className="document-preview-status">
        <FileText size={26} />
        <span>表格中没有可显示的数据。</span>
      </div>
    );
  }
  return (
    <div className="workbook-preview">
      {workbook.sheets.map((sheet) => (
        <section key={sheet.name}>
          <h3>{sheet.name}</h3>
          <div>
            <table>
              <tbody>
                {sheet.rows.map((row, rowIndex) => (
                  <tr key={`${sheet.name}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${sheet.name}-${rowIndex}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function UnsupportedPreview({ node, onDownload }: DocumentPreviewProps) {
  return (
    <div className="document-preview-status">
      <File size={30} />
      <strong>当前类型暂不支持内嵌预览</strong>
      <span>{node.mimeType || extensionLabel(node.name) || '未知类型'} · {formatSize(node.size)}</span>
      <button type="button" onClick={() => onDownload(node)}>
        <Download size={16} />
        下载查看
      </button>
    </div>
  );
}

async function fetchDriveContent(node: DriveNodeView) {
  const response = await fetch(buildDriveContentUrl(node.id));
  if (!response.ok) {
    throw new Error(`无法加载文档内容：HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

function previewKind(node: DriveNodeView): PreviewKind {
  const name = node.name.toLowerCase();
  const mimeType = (node.mimeType || '').toLowerCase();
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  if (
    mimeType.startsWith('text/') ||
    /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|java|py|sql|log|yml|yaml)$/i.test(node.name)
  ) {
    return 'text';
  }
  return 'unsupported';
}

function looksLikePdf(buffer: ArrayBuffer) {
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer.slice(0, 1024)));
  return head.includes('%PDF-');
}

function logPdfDebug(message: string, payload?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[moya-pdf-preview] ${message}`, payload ?? {});
  }
}

function decodeText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function readWorkbook(buffer: ArrayBuffer): WorkbookPreview {
  const workbook = XLSX.read(buffer, { type: 'array' });
  return {
    sheets: workbook.SheetNames.slice(0, 3).map((name) => {
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
        header: 1,
        raw: false,
        defval: ''
      });
      return {
        name,
        rows: rows.slice(0, 80).map((row) => row.slice(0, 24).map((cell) => String(cell ?? '')))
      };
    }).filter((sheet) => sheet.rows.length > 0)
  };
}

function extensionLabel(name: string) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? `${match[1].toUpperCase()} 文件` : '';
}
