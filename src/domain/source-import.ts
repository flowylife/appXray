import type { SourceDocument } from "./types.js";

export type SourceImportResult =
  | {
      ok: true;
      content: string;
      sourceType: SourceDocument["sourceType"];
      fileName: string;
    }
  | {
      ok: false;
      error: string;
      fileName: string;
    };

export function classifySourceFile(fileName: string, content: string): SourceImportResult {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".pdf")) {
    return {
      ok: false,
      error: "PDF 원문 가져오기는 아직 지원 예정입니다.",
      fileName,
    };
  }
  if (normalizedName.endsWith(".md") || normalizedName.endsWith(".markdown")) {
    return {
      ok: true,
      content,
      sourceType: "markdown",
      fileName,
    };
  }
  if (normalizedName.endsWith(".txt")) {
    return {
      ok: true,
      content,
      sourceType: "txt",
      fileName,
    };
  }
  if (normalizedName.endsWith(".csv")) {
    if (!content.trim()) {
      return {
        ok: false,
        error: "CSV 파일이 비어 있습니다. 헤더와 데이터가 있는 파일을 선택하세요.",
        fileName,
      };
    }
    return {
      ok: true,
      content: formatCsvSource(fileName, content),
      sourceType: "csv",
      fileName,
    };
  }
  if (normalizedName.endsWith(".json")) {
    try {
      return {
        ok: true,
        content: JSON.stringify(JSON.parse(content), null, 2),
        sourceType: "json",
        fileName,
      };
    } catch {
      return {
        ok: false,
        error: "JSON 형식을 읽을 수 없습니다. 괄호, 쉼표, 따옴표를 확인하세요.",
        fileName,
      };
    }
  }
  return {
    ok: false,
    error: "지원하지 않는 파일 형식입니다. .md, .markdown, .txt, .csv, .json 파일만 가져올 수 있습니다. PDF는 추후 지원 예정입니다.",
    fileName,
  };
}

export function classifyPastedSource(content: string, fileName = "붙여넣은 원문"): SourceImportResult {
  return {
    ok: true,
    content,
    sourceType: "text",
    fileName,
  };
}

function formatCsvSource(fileName: string, content: string): string {
  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const [headerLine] = normalizedContent.replace(/^\uFEFF/, "").split("\n");
  const headers = headerLine ? parseCsvRow(headerLine).filter(Boolean) : [];
  const headerSummary = headers.length ? headers.join(", ") : "감지된 헤더 없음";

  return [
    `CSV source: ${fileName}`,
    `CSV headers: ${headerSummary}`,
    "",
    normalizedContent,
  ].join("\n");
}

function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    const nextCharacter = row[index + 1];

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (character === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  cells.push(current.trim());
  return cells;
}
