import type { ExportType } from "../export/export-content.js";
import { downloadTextFile, getExportContent, getExportFileName } from "../export/export-content.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { validateWorkspace } from "../domain/validation.js";

export function ExportPanel({
  activeExport,
  workspace,
  onExportChange,
}: {
  activeExport: ExportType;
  workspace: ProjectWorkspace;
  onExportChange: (type: ExportType) => void;
}) {
  const exportPreview = getExportContent(workspace, activeExport);
  const fileName = getExportFileName(workspace, activeExport);
  const validation = validateWorkspace(workspace);

  return (
    <section className="panel" id="export">
      <div className="section-heading export-heading">
        <div>
          <span>내보내기</span>
          <h2>확정 데이터 기반 export</h2>
        </div>
        <button
          disabled={!validation.isExportSafe}
          type="button"
          onClick={() => downloadTextFile(fileName, exportPreview)}
        >
          다운로드
        </button>
      </div>
      <div className="validation-panel" aria-label="내보내기 점검">
        <strong>내보내기 점검</strong>
        {validation.errors.length === 0 && validation.warnings.length === 0 ? (
          <p>고칠 것이 없습니다. 확정된 구조를 내보낼 수 있습니다.</p>
        ) : null}
        {validation.errors.length > 0 ? (
          <div>
            <span>내보내기 전에 고칠 것 {validation.errors.length}</span>
            <ul>
              {validation.errors.map((issue) => <li key={issue.id}>{issue.message}</li>)}
            </ul>
          </div>
        ) : null}
        {validation.warnings.length > 0 ? (
          <div>
            <span>확인 필요 {validation.warnings.length}</span>
            <ul>
              {validation.warnings.map((issue) => <li key={issue.id}>{issue.message}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="segmented" role="tablist" aria-label="Export type">
        <button className={activeExport === "markdown" ? "active" : ""} onClick={() => onExportChange("markdown")}>Markdown</button>
        <button className={activeExport === "appMermaid" ? "active" : ""} onClick={() => onExportChange("appMermaid")}>App Mermaid</button>
        <button className={activeExport === "dataMermaid" ? "active" : ""} onClick={() => onExportChange("dataMermaid")}>Data Mermaid</button>
        <button className={activeExport === "json" ? "active" : ""} onClick={() => onExportChange("json")}>JSON</button>
        <button className={activeExport === "codexPrompt" ? "active" : ""} onClick={() => onExportChange("codexPrompt")}>Codex Prompt</button>
        <button className={activeExport === "cursorPrompt" ? "active" : ""} onClick={() => onExportChange("cursorPrompt")}>Cursor Prompt</button>
        <button className={activeExport === "githubIssues" ? "active" : ""} onClick={() => onExportChange("githubIssues")}>GitHub Issues</button>
        <button className={activeExport === "bundle" ? "active" : ""} onClick={() => onExportChange("bundle")}>Bundle</button>
      </div>
      <p className="muted export-file-name">파일명: {fileName}</p>
      <pre className="preview">{exportPreview}</pre>
    </section>
  );
}
