import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { SlideData } from '../types';

GlobalWorkerOptions.workerSrc = workerSrc;

interface TextContentItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

export async function extractPdfSlides(
  file: File,
  onProgress: (progress: number, label: string) => void,
): Promise<SlideData[]> {
  const buffer = await file.arrayBuffer();
  onProgress(8, 'PDF 구조 확인 중');
  const task = getDocument({ data: buffer });
  const pdf = await task.promise;
  const slides: SlideData[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items as TextContentItem[];
    const lines: string[] = [];
    let currentLine = '';
    let previousY: number | undefined;
    for (const item of items) {
      if (!item.str) continue;
      const currentY = item.transform?.[5];
      const changedLine = previousY !== undefined && currentY !== undefined && Math.abs(currentY - previousY) > 2;
      if ((changedLine || item.hasEOL) && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      currentLine += `${item.str} `;
      if (currentY !== undefined) previousY = currentY;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    let sourceText = lines.join('\n');
    sourceText = sourceText.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1120 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('PDF 페이지를 그릴 Canvas를 만들 수 없습니다.');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const firstLine = sourceText
      .split('\n')
      .find((line) => line.length > 3 && !/report\s*navi|공모전\s*시연용|^\d+$/i.test(line))
      || `PDF 페이지 ${pageNumber}`;
    slides.push({
      page: pageNumber,
      title: firstLine.slice(0, 72),
      sourceText: sourceText || `페이지 ${pageNumber}에서 추출 가능한 텍스트가 없습니다.`,
      imageDataUrl: canvas.toDataURL('image/jpeg', 0.86),
      footer: `${file.name} · ${pageNumber}/${pdf.numPages}`,
    });
    onProgress(8 + Math.round((pageNumber / pdf.numPages) * 86), `${pageNumber}/${pdf.numPages} 페이지 분석 중`);
  }

  onProgress(100, '페이지 분석 완료');
  return slides;
}
