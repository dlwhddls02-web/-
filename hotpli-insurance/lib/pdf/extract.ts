import "server-only";

/**
 * PDF 텍스트 추출 (unpdf/pdfjs) — 좌표 기반으로 줄을 복원해 표 형태 문서에 강하다.
 * 진료 데이터는 민감정보 — 추출 결과를 로그에 남기지 말 것.
 */

export interface PageText {
  page: number;
  lines: string[];
}

export interface ExtractResult {
  pages: PageText[];
  /** 전체 줄을 순서대로 합친 배열 (파서 입력) */
  lines: string[];
  pageCount: number;
  /** 텍스트 레이어가 거의 없는 스캔본 — MVP는 "지원 예정" 안내 */
  isScanned: boolean;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
}

/** 같은 줄로 묶을 y좌표 허용 오차 (pt) */
const LINE_Y_TOLERANCE = 3;

export async function extractText(pdf: Uint8Array): Promise<ExtractResult> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(pdf);

  const pages: PageText[] = [];
  let totalItems = 0;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    const items: PositionedItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const str = String(raw.str).trim();
      if (!str) continue;
      const transform = (raw as { transform: number[] }).transform;
      items.push({ str, x: transform[4], y: transform[5] });
    }
    totalItems += items.length;

    // y좌표(위→아래) 기준으로 줄 그룹핑 후 x좌표(좌→우) 순으로 병합
    const lineGroups: { y: number; parts: PositionedItem[] }[] = [];
    for (const item of items) {
      const group = lineGroups.find(
        (g) => Math.abs(g.y - item.y) <= LINE_Y_TOLERANCE,
      );
      if (group) group.parts.push(item);
      else lineGroups.push({ y: item.y, parts: [item] });
    }
    const lines = lineGroups
      .sort((a, b) => b.y - a.y)
      .map((g) =>
        g.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((l) => l.length > 0);

    pages.push({ page: pageNo, lines });
  }

  // 페이지당 텍스트 조각이 거의 없으면 스캔본으로 판단
  const isScanned = doc.numPages > 0 && totalItems < doc.numPages * 3;

  return {
    pages,
    lines: pages.flatMap((p) => p.lines),
    pageCount: doc.numPages,
    isScanned,
  };
}
