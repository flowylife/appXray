import { useState } from "react";
import type { ExportType } from "../export/export-content.js";
import { downloadTextFile, getExportContent, getExportFileName, type ExportMode } from "../export/export-content.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { validateWorkspace, type ValidationIssue } from "../domain/validation.js";
import { getValidationIssueTarget, getValidationRepairActionLabel } from "../domain/validation-actions.js";

const UPCOMING_EXPORTS = ["PDF", "Notion", "Linear", "Jira", "Supabase", "Figma"];

export function ExportPanel({
  activeExport,
  workspace,
  onExportChange,
  onJumpToIssue,
  onRepairIssue,
}: {
  activeExport: ExportType;
  workspace: ProjectWorkspace;
  onExportChange: (type: ExportType) => void;
  onJumpToIssue?: ((issue: ValidationIssue) => void) | undefined;
  onRepairIssue?: ((issue: ValidationIssue) => void) | undefined;
}) {
  const [exportMode, setExportMode] = useState<ExportMode>("confirmedOnly");
  const [includeValidationAppendix, setIncludeValidationAppendix] = useState(false);
  const exportPreview = getExportContent(workspace, activeExport, { mode: exportMode, includeValidationAppendix });
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
              {validation.errors.map((issue) => (
                <ValidationIssueRow
                  issue={issue}
                  key={issue.id}
                  onJumpToIssue={onJumpToIssue}
                  onRepairIssue={onRepairIssue}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {validation.warnings.length > 0 ? (
          <div>
            <span>확인 필요 {validation.warnings.length}</span>
            <ul>
              {validation.warnings.map((issue) => (
                <ValidationIssueRow
                  issue={issue}
                  key={issue.id}
                  onJumpToIssue={onJumpToIssue}
                  onRepairIssue={onRepairIssue}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="export-options" aria-label="Export options">
        <div className="segmented">
          <button className={exportMode === "confirmedOnly" ? "active" : ""} type="button" onClick={() => setExportMode("confirmedOnly")}>확정만</button>
          <button className={exportMode === "auditTrail" ? "active" : ""} type="button" onClick={() => setExportMode("auditTrail")}>검토 이력 포함</button>
        </div>
        <label className="checkbox-label">
          <input
            checked={includeValidationAppendix}
            type="checkbox"
            onChange={(event) => setIncludeValidationAppendix(event.target.checked)}
          />
          내보내기 점검 결과를 함께 포함
        </label>
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
      <p className="muted export-file-name">지원 예정: {UPCOMING_EXPORTS.join(", ")}</p>
      <p className="muted export-file-name">파일명: {fileName}</p>
      <pre className="preview">{exportPreview}</pre>
    </section>
  );
}

function ValidationIssueRow({
  issue,
  onJumpToIssue,
  onRepairIssue,
}: {
  issue: ValidationIssue;
  onJumpToIssue?: ((issue: ValidationIssue) => void) | undefined;
  onRepairIssue?: ((issue: ValidationIssue) => void) | undefined;
}) {
  const repairLabel = getValidationRepairActionLabel(issue);
  const target = getValidationIssueTarget(issue);

  return (
    <li>
      <span>{issue.message}</span>
      <div className="validation-actions">
        {target && onJumpToIssue ? (
          <button className="secondary" type="button" onClick={() => onJumpToIssue(issue)}>
            검토로 이동
          </button>
        ) : null}
        {repairLabel && onRepairIssue ? (
          <button className="secondary" type="button" onClick={() => onRepairIssue(issue)}>
            {repairLabel}
          </button>
        ) : null}
      </div>
    </li>
  );
}
