import { useEffect, useState } from "react";
import type { ExportType } from "../export/export-content.js";
import {
  downloadTextFile,
  getExportContent,
  getExportFileName,
  type ExportMode,
} from "../export/export-content.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { validateWorkspace, type ValidationIssue } from "../domain/validation.js";
import { getValidationIssueTarget, getValidationRepairActionLabel } from "../domain/validation-actions.js";
import { createTranslator, getExportDescription, type AppLanguage, type Translator } from "../i18n.js";

const UPCOMING_EXPORTS = ["PDF", "Notion", "Linear", "Jira", "Supabase", "Figma"];
const DEFAULT_TRANSLATOR = createTranslator("ko");

export function ExportPanel({
  activeExport,
  workspace,
  onExportChange,
  onJumpToIssue,
  onRepairIssue,
  language = "ko",
  t = DEFAULT_TRANSLATOR,
}: {
  activeExport: ExportType;
  workspace: ProjectWorkspace;
  onExportChange: (type: ExportType) => void;
  onJumpToIssue?: ((issue: ValidationIssue) => void) | undefined;
  onRepairIssue?: ((issue: ValidationIssue) => void) | undefined;
  language?: AppLanguage;
  t?: Translator;
}) {
  const [exportMode, setExportMode] = useState<ExportMode>("confirmedOnly");
  const [includeValidationAppendix, setIncludeValidationAppendix] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const exportPreview = getExportContent(workspace, activeExport, { mode: exportMode, includeValidationAppendix });
  const fileName = getExportFileName(workspace, activeExport);
  const validation = validateWorkspace(workspace);
  const exportDescription = getExportDescription(language, activeExport);

  useEffect(() => {
    setCopyStatus("idle");
  }, [activeExport, exportMode, includeValidationAppendix, workspace.updatedAt]);

  async function copyPreview() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable.");
      await navigator.clipboard.writeText(exportPreview);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section className="panel" id="export">
      <div className="section-heading export-heading">
        <div>
          <span>{t("export.section")}</span>
          <h2>{t("export.title")}</h2>
        </div>
        <button
          disabled={!validation.isExportSafe}
          type="button"
          onClick={() => downloadTextFile(fileName, exportPreview)}
        >
          {t("export.download")}
        </button>
      </div>
      <div className="validation-panel" aria-label={t("export.validationLabel")}>
        <strong>{t("export.validationLabel")}</strong>
        {validation.errors.length === 0 && validation.warnings.length === 0 ? (
          <p>{t("export.noValidationIssues")}</p>
        ) : null}
        {validation.errors.length > 0 ? (
          <div>
            <span>{t("export.errors", { count: validation.errors.length })}</span>
            <ul>
              {validation.errors.map((issue) => (
                <ValidationIssueRow
                  issue={issue}
                  key={issue.id}
                  language={language}
                  t={t}
                  onJumpToIssue={onJumpToIssue}
                  onRepairIssue={onRepairIssue}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {validation.warnings.length > 0 ? (
          <div>
            <span>{t("export.warnings", { count: validation.warnings.length })}</span>
            <ul>
              {validation.warnings.map((issue) => (
                <ValidationIssueRow
                  issue={issue}
                  key={issue.id}
                  language={language}
                  t={t}
                  onJumpToIssue={onJumpToIssue}
                  onRepairIssue={onRepairIssue}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="export-options" aria-label="Export options">
        <div className="export-mode-note" aria-label="Export mode notice">
          <span className={exportMode === "confirmedOnly" ? "active-mode-label" : ""}>{t("export.confirmedModeNotice")}</span>
          <span className={exportMode === "auditTrail" ? "audit-trail-label active-mode-label" : "audit-trail-label"}>
            {t("export.auditModeNotice")}
          </span>
        </div>
        <div className="segmented">
          <button className={exportMode === "confirmedOnly" ? "active" : ""} type="button" onClick={() => setExportMode("confirmedOnly")}>{t("export.confirmedOnly")}</button>
          <button className={exportMode === "auditTrail" ? "active" : ""} type="button" onClick={() => setExportMode("auditTrail")}>{t("export.auditTrail")}</button>
        </div>
        <label className="checkbox-label">
          <input
            checked={includeValidationAppendix}
            type="checkbox"
            onChange={(event) => setIncludeValidationAppendix(event.target.checked)}
          />
          {t("export.includeValidation")}
        </label>
      </div>
      <div className="segmented" role="tablist" aria-label="Export type">
        <button className={activeExport === "markdown" ? "active" : ""} onClick={() => onExportChange("markdown")}>Markdown</button>
        <button className={activeExport === "appMermaid" ? "active" : ""} onClick={() => onExportChange("appMermaid")}>App Mermaid</button>
        <button className={activeExport === "dataMermaid" ? "active" : ""} onClick={() => onExportChange("dataMermaid")}>Data Mermaid</button>
        <button className={activeExport === "json" ? "active" : ""} onClick={() => onExportChange("json")}>JSON</button>
        <button className={activeExport === "dataObjectsCsv" ? "active" : ""} onClick={() => onExportChange("dataObjectsCsv")}>Data Objects CSV</button>
        <button className={activeExport === "issuesCsv" ? "active" : ""} onClick={() => onExportChange("issuesCsv")}>Issues CSV</button>
        <button className={activeExport === "codexPrompt" ? "active" : ""} onClick={() => onExportChange("codexPrompt")}>Codex Prompt</button>
        <button className={activeExport === "cursorPrompt" ? "active" : ""} onClick={() => onExportChange("cursorPrompt")}>Cursor Prompt</button>
        <button className={activeExport === "githubIssues" ? "active" : ""} onClick={() => onExportChange("githubIssues")}>GitHub Issues</button>
        <button className={activeExport === "bundle" ? "active" : ""} onClick={() => onExportChange("bundle")}>Bundle</button>
      </div>
      <div className="export-description" aria-label="Export format description">
        <strong>{fileName}</strong>
        <p>{exportDescription}</p>
      </div>
      <p className="muted export-file-name">{t("export.upcoming", { items: UPCOMING_EXPORTS.join(", ") })}</p>
      <p className="muted export-file-name">{t("export.fileName", { fileName })}</p>
      <div className="export-preview-actions">
        <button className="secondary" type="button" onClick={copyPreview}>{t("export.copyPreview")}</button>
        <span aria-live="polite">
          {copyStatus === "success" ? t("export.copySuccess") : null}
          {copyStatus === "error" ? t("export.copyError") : null}
        </span>
      </div>
      <pre className="preview">{exportPreview}</pre>
    </section>
  );
}

function ValidationIssueRow({
  issue,
  onJumpToIssue,
  onRepairIssue,
  language,
  t,
}: {
  issue: ValidationIssue;
  onJumpToIssue?: ((issue: ValidationIssue) => void) | undefined;
  onRepairIssue?: ((issue: ValidationIssue) => void) | undefined;
  language: AppLanguage;
  t: Translator;
}) {
  const repairLabel = language === "ko" ? getValidationRepairActionLabel(issue) : getEnglishRepairActionLabel(issue);
  const target = getValidationIssueTarget(issue);

  return (
    <li>
      <span>{getValidationIssueMessage(issue, language)}</span>
      <div className="validation-actions">
        {target && onJumpToIssue ? (
          <button className="secondary" type="button" onClick={() => onJumpToIssue(issue)}>
            {t("export.jumpToReview")}
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

function getValidationIssueMessage(issue: ValidationIssue, language: AppLanguage): string {
  if (language === "ko") return issue.message;
  if (issue.code === "empty_screen_name") return "Fix before export: a screen name is empty.";
  if (issue.code === "empty_object_name") return "Fix before export: a stored information item has an empty name.";
  if (issue.code === "duplicate_name" && issue.targetBucket === "screens") return "Fix before export: screen names overlap.";
  if (issue.code === "duplicate_name" && issue.targetBucket === "dataObjects") return "Fix before export: stored information names overlap.";
  if (issue.code === "data_object_without_fields") return "Needs review: stored information has no confirmed fields.";
  if (issue.code === "non_confirmed_export") return "Fix before export: a confirmed item references unconfirmed structure.";
  if (issue.code === "orphan_field") return "Fix before export: a confirmed field has no connected app information.";
  if (issue.code === "broken_relation") return "Fix before export: an information relationship is broken.";
  if (issue.code === "screen_without_features") return "Needs review: a confirmed screen has no confirmed features.";
  if (issue.code === "flow_without_steps") return "Fix before export: user flows need at least two confirmed steps.";
  if (issue.code === "high_severity_issue") return "Needs review: an important unresolved decision remains.";
  if (issue.code === "no_confirmed_screens") return "Needs review: no screens are confirmed.";
  if (issue.code === "no_confirmed_data_objects") return "Needs review: no stored information is confirmed.";
  return issue.message;
}

function getEnglishRepairActionLabel(issue: ValidationIssue): string | null {
  if (issue.suggestedAction === "remove_broken_relation") return "Exclude broken link";
  if (issue.suggestedAction === "mark_duplicate_deferred") return "Decide duplicate later";
  if (issue.suggestedAction === "exclude_issue_from_prompt") return "Exclude from prompt";
  return null;
}
