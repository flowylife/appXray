import type { ExportType } from "../export/export-content.js";
import { downloadTextFile, getExportContent, getExportFileName } from "../export/export-content.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

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

  return (
    <section className="panel" id="export">
      <div className="section-heading export-heading">
        <div>
          <span>내보내기</span>
          <h2>확정 데이터 기반 export</h2>
        </div>
        <button type="button" onClick={() => downloadTextFile(fileName, exportPreview)}>다운로드</button>
      </div>
      <div className="segmented" role="tablist" aria-label="Export type">
        <button className={activeExport === "markdown" ? "active" : ""} onClick={() => onExportChange("markdown")}>Markdown</button>
        <button className={activeExport === "appMermaid" ? "active" : ""} onClick={() => onExportChange("appMermaid")}>App Mermaid</button>
        <button className={activeExport === "dataMermaid" ? "active" : ""} onClick={() => onExportChange("dataMermaid")}>Data Mermaid</button>
        <button className={activeExport === "json" ? "active" : ""} onClick={() => onExportChange("json")}>JSON</button>
      </div>
      <p className="muted export-file-name">파일명: {fileName}</p>
      <pre className="preview">{exportPreview}</pre>
    </section>
  );
}
