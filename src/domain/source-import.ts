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
  return {
    ok: false,
    error: "지원하는 원문 파일은 .md, .markdown, .txt 입니다. PDF는 지원 예정입니다.",
    fileName,
  };
}
