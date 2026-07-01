import { useEffect, useMemo, useState } from "react";
import { mockAiProviderAdapter } from "./ai/adapter.js";
import { runWorkspaceAnalysis } from "./app/run-analysis.js";
import { AI_PROVIDER_REGISTRY, getAiProviderMetadata } from "./ai/provider-registry.js";
import { DEFAULT_AI_PROVIDER_CONFIG, loadAiProviderConfig, saveAiProviderConfig, type AiProviderConfig, type AiProviderName } from "./ai/settings.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { MapPanels, MissingParts } from "./components/MapPanels.js";
import { type EditableXrayObject, type ObjectBucket, ReviewPanel } from "./components/ReviewPanel.js";
import {
  applyStatusDecisionToSuggestionSet,
  editXrayObject,
  type ReviewStatusDecisionGroup,
  undoLatestStatusDecision,
} from "./domain/lifecycle.js";
import { parseAppRoute, projectOrListRoute, projectRoute, type ProjectRouteSection } from "./domain/routes.js";
import { classifySourceFile } from "./domain/source-import.js";
import { appendSourceDocumentVersion, getLatestSourceDocument } from "./domain/source-documents.js";
import { isConfirmedXrayObject } from "./domain/status.js";
import { applyTemplateToWorkspace } from "./domain/template.js";
import type { BaseXrayObject, SourceDocument, SuggestionStatus, XrayObject, XraySuggestionSet } from "./domain/types.js";
import { getValidationIssueElementId, getValidationIssueTarget, getValidationReviewRoute } from "./domain/validation-actions.js";
import { validateWorkspace, type ValidationIssue } from "./domain/validation.js";
import type { ProjectWorkspace } from "./domain/workspace.js";
import type { ExportType } from "./export/export-content.js";
import { fieldPowerAppSourceDocument } from "./fixtures/field-power-app.js";
import { fieldPowerTemplate } from "./fixtures/field-power-template.js";
import { createBuildPrompt, type ExtendedBuildPromptTarget } from "./prompt/build-prompt.js";
import { createLocalStorageProjectRepository, createProjectWorkspace, summarizeProjects } from "./storage/project-repository.js";
import {
  createAutosaveSnapshot,
  listAutosaveSnapshots,
  restoreAutosaveSnapshot,
  type AutosaveSnapshotSummary,
} from "./storage/autosave-snapshots.js";
import {
  mergeWorkspaceBackup,
  parseWorkspaceBackup,
  replaceWorkspaceFromBackup,
  serializeWorkspaceBackup,
} from "./storage/workspace-backup.js";
import { downloadTextFile } from "./export/export-content.js";
import {
  createTranslator,
  formatDateTimeForLanguage,
  getSourceTypeLabel,
  LANGUAGE_OPTIONS,
  loadLanguage,
  saveLanguage,
  type AppLanguage,
  type Translator,
} from "./i18n.js";

const DEFAULT_PRD = fieldPowerAppSourceDocument.content;
const AI_PROVIDER_OPTIONS = Object.values(AI_PROVIDER_REGISTRY);

type PendingBackupImport = {
  exportedAt: string;
  workspace: ProjectWorkspace;
  validation: ReturnType<typeof validateWorkspace>;
};

type PendingSnapshotRestore = {
  snapshotId: string;
  createdAt: string;
  workspace: ProjectWorkspace;
  validation: ReturnType<typeof validateWorkspace>;
};

type AnalysisRunState =
  | { status: "idle" }
  | { status: "running"; provider: AiProviderName }
  | { status: "success"; message: string }
  | { status: "validation-failed"; message: string }
  | { status: "provider-error"; message: string };

export default function App() {
  const repository = useMemo(() => createLocalStorageProjectRepository(), []);
  const initialLoad = useMemo(() => repository.loadCollectionWithStatus(), [repository]);
  const initialLanguage = useMemo(() => loadLanguage(), []);
  const initialTranslator = useMemo(() => createTranslator(initialLanguage), [initialLanguage]);
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const t = useMemo(() => createTranslator(language), [language]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(() => initialLoad.activeWorkspace);
  const [projectSummaries, setProjectSummaries] = useState(() => summarizeProjects(initialLoad.collection));
  const [projectName, setProjectName] = useState(workspace?.project.name ?? defaultProjectName(initialLanguage));
  const [sourceText, setSourceText] = useState(workspace?.sourceDocuments.at(0)?.content ?? DEFAULT_PRD);
  const [sourceType, setSourceType] = useState<SourceDocument["sourceType"]>(workspace?.sourceDocuments.at(0)?.sourceType ?? "text");
  const [sourceImportMessage, setSourceImportMessage] = useState<string | null>(null);
  const [sourceImportSeverity, setSourceImportSeverity] = useState<"info" | "error">("info");
  const [lastImportedAt, setLastImportedAt] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<ExportType>("markdown");
  const [promptTarget, setPromptTarget] = useState<ExtendedBuildPromptTarget>("codex");
  const [selectedBuildStep, setSelectedBuildStep] = useState("");
  const [saveError, setSaveError] = useState<string | null>(initialLoad.error ?? null);
  const [saveStatus, setSaveStatus] = useState<string | null>(initialLoad.activeWorkspace ? initialTranslator("save.loadSuccess") : null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig>(() => loadAiProviderConfig());
  const [aiSettingsMessage, setAiSettingsMessage] = useState<string | null>(null);
  const [analysisRunState, setAnalysisRunState] = useState<AnalysisRunState>({ status: "idle" });
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const [snapshotSummaries, setSnapshotSummaries] = useState<AutosaveSnapshotSummary[]>(() =>
    workspace ? listAutosaveSnapshots(window.localStorage, workspace.project.id) : [],
  );
  const [pendingSnapshotRestore, setPendingSnapshotRestore] = useState<PendingSnapshotRestore | null>(null);
  const [route, setRoute] = useState(() => parseAppRoute(window.location.hash));
  const [statusHistory, setStatusHistory] = useState<ReviewStatusDecisionGroup[]>([]);
  const [focusedValidationIssue, setFocusedValidationIssue] = useState<ValidationIssue | null>(null);

  useEffect(() => {
    if (!workspace) return;
    try {
      const result = repository.saveWorkspace(workspace);
      const snapshotResult = createAutosaveSnapshot(window.localStorage, workspace);
      setSnapshotSummaries(listAutosaveSnapshots(window.localStorage, workspace.project.id));
      setProjectSummaries(summarizeProjects(result.collection));
      setSaveError(result.error ?? null);
      setSaveStatus(result.error ? null : t("save.localSaved"));
      if (!snapshotResult.ok) {
        setBackupMessage(snapshotResult.error);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("save.unable"));
      setSaveStatus(null);
    }
  }, [repository, workspace]);

  useEffect(() => {
    if (!workspace) return;
    setProjectName(workspace.project.name);
    const latest = getLatestSourceDocument(workspace);
    setSourceText(latest?.content ?? DEFAULT_PRD);
    setSourceType(latest?.sourceType ?? "text");
  }, [workspace?.project.id]);

  useEffect(() => {
    function syncRoute() {
      setRoute(parseAppRoute(window.location.hash));
    }
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (route.name === "aiSettings") {
      window.requestAnimationFrame(() => document.getElementById("settings-ai")?.scrollIntoView({ block: "start" }));
      return;
    }
    if (route.name !== "projectSection") return;
    if (workspace?.project.id !== route.projectId) openProject(route.projectId, route.section);
    const sectionId = sectionIdForRoute(route.section);
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ block: "start" }));
  }, [route, workspace?.project.id]);

  useEffect(() => {
    setStatusHistory([]);
  }, [workspace?.project.id]);

  const confirmedCounts = workspace ? countConfirmed(workspace.objects) : 0;
  const totalCounts = workspace ? countAll(workspace.objects) : 0;
  const buildPrompt = workspace
    ? createBuildPrompt(workspace, {
      targetTool: promptTarget,
      ...(selectedBuildStep ? { buildStepTempId: selectedBuildStep } : {}),
    })
    : "";
  const validationReport = workspace ? validateWorkspace(workspace) : null;
  const validationIssues = validationReport ? [...validationReport.errors, ...validationReport.warnings] : [];
  const latestSourceDocument = workspace ? getLatestSourceDocument(workspace) : undefined;
  const aiSettingsPanel = (
    <section className="panel" id="settings-ai">
      <div className="section-heading">
        <span>{t("aiSettings.section")}</span>
        <h2>{t("aiSettings.title")}</h2>
      </div>
      <p className="muted">{t("aiSettings.localOnly")}</p>
      <div className="form-grid settings-grid">
        <label>
          {t("aiSettings.provider")}
          <select value={aiConfig.provider} onChange={(event) => updateAiProvider(event.target.value as AiProviderName)}>
            {AI_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.provider} value={provider.provider}>{provider.label}</option>
            ))}
          </select>
        </label>
        <label>
          {t("aiSettings.model")}
          <input value={aiConfig.modelName} onChange={(event) => updateAiConfig({ modelName: event.target.value })} />
        </label>
        <label>
          {t("aiSettings.apiKey")}
          <input
            placeholder={aiConfig.apiKeyPresent ? t("aiSettings.savedKey") : t("aiSettings.localKey")}
            type="password"
            value={aiConfig.apiKey ?? ""}
            onChange={(event) => updateAiConfig({ apiKey: event.target.value })}
          />
        </label>
      </div>
      <p className="muted export-file-name">{getAiProviderMetadata(aiConfig.provider).description}</p>
      <div className="button-row">
        <button type="button" onClick={saveAiSettings}>{t("aiSettings.save")}</button>
        <button className="secondary" type="button" onClick={() => setAiConfig(DEFAULT_AI_PROVIDER_CONFIG)}>{t("aiSettings.resetMock")}</button>
      </div>
      {aiConfig.lastValidatedAt ? <p className="muted export-file-name">{t("aiSettings.lastChecked", { time: formatDateTime(aiConfig.lastValidatedAt, language) })}</p> : null}
      {aiSettingsMessage ? <p className="notice info">{aiSettingsMessage}</p> : null}
    </section>
  );

  function updateLanguage(nextLanguage: AppLanguage) {
    saveLanguage(nextLanguage);
    setLanguage(nextLanguage);
  }

  function createProject() {
    const validationError = validateProjectForm();
    if (validationError) {
      setFormError(validationError);
      setSaveStatus(null);
      return;
    }
    const now = new Date().toISOString();
    const nextWorkspace = createProjectWorkspace({
      name: projectName,
      sourceText,
      sourceType,
      now,
    });
    const result = repository.saveWorkspace(nextWorkspace);
    if (result.error) {
      setFormError(result.error);
      setSaveError(result.error);
      setSaveStatus(null);
      return;
    }
    setFormError(null);
    setWorkspace(nextWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    setSaveError(null);
    setSaveStatus(t("save.localSaved"));
    navigateTo(projectRoute(nextWorkspace.project.id, "review"));
  }

  async function runAnalysis() {
    const validationError = validateProjectForm();
    if (validationError) {
      setFormError(validationError);
      setSaveStatus(null);
      setAnalysisRunState({ status: "validation-failed", message: validationError });
      return;
    }
    const now = new Date().toISOString();
    const baseWorkspace = workspace ?? createWorkspaceFromForm(now);
    const versionedWorkspace = syncSourceDocument(updateWorkspaceFromForm(baseWorkspace, now), now);
    const sourceDocument = getLatestSourceDocument(versionedWorkspace);
    if (!sourceDocument) return;
    setAnalysisRunState({ status: "running", provider: aiConfig.provider });
    const result = await runWorkspaceAnalysis({
      aiConfig,
      workspace: versionedWorkspace,
      sourceDocument,
      now,
    });
    if (!result.ok) {
      setAnalysisRunState({ status: result.status, message: result.message });
      return;
    }

    const nextWorkspace = result.workspace;
    if (commitWorkspace(nextWorkspace, t("analysis.mockComplete"))) {
      setAnalysisRunState({ status: "success", message: result.message });
      navigateTo(projectRoute(nextWorkspace.project.id, "review"));
    }
  }

  function createWorkspaceFromForm(now: string): ProjectWorkspace {
    return createProjectWorkspace({ name: projectName, sourceText, sourceType, now });
  }

  function updateObjectStatus(bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) {
    updateObjectsStatus(bucket, [object], status);
  }

  function updateObjectsStatus(bucket: ObjectBucket, objectsToUpdate: XrayObject[], status: SuggestionStatus) {
    const now = new Date().toISOString();
    setWorkspace((current) => {
      if (!current || objectsToUpdate.length === 0) return current;
      const result = applyStatusDecisionToSuggestionSet(
        current.objects,
        bucket,
        objectsToUpdate.map((object) => object.id),
        status,
        now,
      );
      if (!result.decisionGroup) return current;
      const decisionGroup = result.decisionGroup;
      setStatusHistory((history) => [...history, decisionGroup].slice(-25));
      return {
        ...current,
        objects: result.objects,
        updatedAt: now,
      };
    });
  }

  function editObject(bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) {
    const now = new Date().toISOString();
    const nextObject = editXrayObject(object, patch as never, now);
    replaceObjectWithDecision(
      bucket,
      object.id,
      nextObject,
      {
        id: `decision_${now}`,
        decidedAt: now,
        decisions: [
          {
            bucket,
            objectId: object.id,
            previousObject: object,
            nextStatus: "edited",
          },
        ],
      },
      now,
    );
  }

  function toggleIssuePrompt(issue: EditableXrayObject) {
    if (!("issueType" in issue)) return;
    replaceObject(
      "issues",
      issue.id,
      editXrayObject(issue, { includeInPrompt: issue.includeInPrompt === false }),
    );
  }

  function jumpToValidationIssue(issue: ValidationIssue) {
    if (!workspace) return;
    setFocusedValidationIssue(issue);
    navigateTo(getValidationReviewRoute(issue, workspace.project.id));
    const elementId = getValidationIssueElementId(issue);
    if (elementId) {
      window.requestAnimationFrame(() => document.getElementById(elementId)?.scrollIntoView({ block: "center" }));
    }
  }

  function repairValidationIssue(issue: ValidationIssue) {
    if (!workspace) return;
    const target = getValidationIssueTarget(issue);
    if (!target) return;
    const object = findWorkspaceObject(workspace, target.bucket, target.id);
    if (!object) return;

    if (issue.suggestedAction === "remove_broken_relation") {
      updateObjectsStatus(target.bucket, [object], "rejected");
      jumpToValidationIssue(issue);
      return;
    }
    if (issue.suggestedAction === "mark_duplicate_deferred") {
      updateObjectsStatus(target.bucket, [object], "deferred");
      jumpToValidationIssue(issue);
      return;
    }
    if (issue.suggestedAction === "exclude_issue_from_prompt" && target.bucket === "issues" && "issueType" in object) {
      replaceObject(
        "issues",
        object.id,
        editXrayObject(object, { includeInPrompt: false }),
      );
      jumpToValidationIssue(issue);
    }
  }

  function replaceObject(bucket: ObjectBucket, id: string, nextObject: XrayObject) {
    replaceObjectWithDecision(bucket, id, nextObject);
  }

  function replaceObjectWithDecision(
    bucket: ObjectBucket,
    id: string,
    nextObject: XrayObject,
    decisionGroup?: ReviewStatusDecisionGroup,
    now = new Date().toISOString(),
  ) {
    setWorkspace((current) => {
      if (!current) return current;
      const collection = current.objects[bucket] as XrayObject[];
      if (decisionGroup) {
        setStatusHistory((history) => [...history, decisionGroup].slice(-25));
      }
      return {
        ...current,
        objects: {
          ...current.objects,
          [bucket]: collection.map((object) => (object.id === id ? nextObject : object)),
        },
        updatedAt: now,
      };
    });
  }

  function undoStatusDecision() {
    const now = new Date().toISOString();
    setWorkspace((current) => {
      if (!current) return current;
      const result = undoLatestStatusDecision(current.objects, statusHistory);
      if (result.restoredCount === 0) return current;
      setStatusHistory(result.history);
      return {
        ...current,
        objects: result.objects,
        updatedAt: now,
      };
    });
  }

  function resetWorkspace() {
    const confirmMessage = language === "ko"
      ? "현재 로컬 프로젝트를 초기화할까요? 이 작업은 되돌릴 수 없습니다."
      : "Delete the current local project? This cannot be undone.";
    if (workspace && !window.confirm(confirmMessage)) {
      return;
    }
    if (!workspace) return;
    const result = repository.deleteWorkspace(workspace.project.id);
    setWorkspace(result.activeWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    if (!result.activeWorkspace) {
      setProjectName(defaultProjectName(language));
      setSourceText(DEFAULT_PRD);
    }
    navigateTo(projectOrListRoute(result.activeWorkspace?.project.id, "review"));
  }

  function openProject(projectId: string, section: ProjectRouteSection = "review") {
    const result = repository.setActiveProject(projectId);
    setWorkspace(result.workspace);
    setSaveError(result.error ?? null);
    setSaveStatus(result.error ? null : t("save.opened"));
    setPendingDeleteProjectId(null);
    if (!result.workspace || result.workspace.project.id !== projectId) {
      navigateTo(projectOrListRoute(result.workspace?.project.id, "review"));
      return;
    }
    navigateTo(projectRoute(projectId, section));
  }

  function deleteProject(projectId: string) {
    if (pendingDeleteProjectId !== projectId) {
      setPendingDeleteProjectId(projectId);
      return;
    }
    const result = repository.deleteWorkspace(projectId);
    setWorkspace(result.activeWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    setPendingDeleteProjectId(null);
    setSaveError(result.error ?? null);
    setSaveStatus(t("save.deleted"));
    if (!result.activeWorkspace) {
      setProjectName(defaultProjectName(language));
      setSourceText(DEFAULT_PRD);
    }
    navigateTo(projectOrListRoute(result.activeWorkspace?.project.id, "review"));
  }

  function navigateTo(hash: string) {
    window.location.hash = hash;
    setRoute(parseAppRoute(hash));
  }

  function saveSourceVersion() {
    const validationError = validateProjectForm();
    if (validationError) {
      setFormError(validationError);
      setSaveStatus(null);
      return;
    }
    const now = new Date().toISOString();
    const baseWorkspace = workspace ?? createWorkspaceFromForm(now);
    const nextWorkspace = syncSourceDocument(updateWorkspaceFromForm(baseWorkspace, now), now);
    commitWorkspace(nextWorkspace, t("save.localSaved"));
  }

  function updateSourceText(value: string) {
    setSourceText(value);
    setSourceType("text");
    setSourceImportMessage(null);
    setLastImportedAt(null);
  }

  function updateWorkspaceFromForm(baseWorkspace: ProjectWorkspace, now: string): ProjectWorkspace {
    return {
      ...baseWorkspace,
      project: {
        ...baseWorkspace.project,
        name: projectName.trim(),
        updatedAt: now,
      },
      updatedAt: now,
    };
  }

  function commitWorkspace(nextWorkspace: ProjectWorkspace, successMessage: string): boolean {
    const result = repository.saveWorkspace(nextWorkspace);
    if (result.error) {
      setFormError(result.error);
      setSaveError(result.error);
      setSaveStatus(null);
      return false;
    }
    setFormError(null);
    setWorkspace(nextWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    setSaveError(null);
    setSaveStatus(successMessage);
    return true;
  }

  function syncSourceDocument(baseWorkspace: ProjectWorkspace, now: string): ProjectWorkspace {
    return appendSourceDocumentVersion(baseWorkspace, sourceText, {
      id: `src_${crypto.randomUUID()}`,
      createdAt: now,
      sourceType,
    });
  }

  async function importSourceFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    const result = classifySourceFile(file.name, content);
    if (!result.ok) {
      setSourceImportMessage(result.error);
      setSourceImportSeverity("error");
      return;
    }
    setSourceText(result.content);
    setSourceType(result.sourceType);
    setSourceImportMessage(t("source.importSuccess", { fileName: result.fileName }));
    setSourceImportSeverity("info");
    setLastImportedAt(new Date().toISOString());
  }

  function applyBuiltInTemplate() {
    const now = new Date().toISOString();
    const baseWorkspace = workspace ?? createWorkspaceFromForm(now);
    const result = applyTemplateToWorkspace(baseWorkspace, fieldPowerTemplate, now);
    setWorkspace(result.workspace);
    setTemplateMessage(
      result.validation.isValid
        ? t("template.applied", { name: fieldPowerTemplate.name })
        : result.validation.errors.map((issue) => issue.message).join(" / "),
    );
  }

  function saveAiSettings() {
    const result = mockAiProviderAdapter.validateConnection(aiConfig);
    const nextConfig = {
      ...aiConfig,
      apiKeyPresent: Boolean(aiConfig.apiKey?.trim() || aiConfig.apiKeyPresent),
      lastValidatedAt: result.checkedAt,
    };
    saveAiProviderConfig(nextConfig);
    setAiConfig(nextConfig);
    setAiSettingsMessage(result.ok ? t("aiSettings.saved") : result.error);
  }

  function updateAiConfig(patch: Partial<AiProviderConfig>) {
    setAiConfig((current) => ({ ...current, ...patch }));
  }

  function updateAiProvider(provider: AiProviderName) {
    const metadata = getAiProviderMetadata(provider);
    setAiConfig((current) => ({
      ...current,
      provider,
      modelName: metadata.defaultModel,
      apiKey: undefined,
      apiKeyPresent: false,
      lastValidatedAt: undefined,
    }));
    setAiSettingsMessage(null);
  }

  function downloadWorkspaceBackup() {
    if (!workspace) return;
    const fileName = `app-xray-workspace-${workspace.project.name.trim().replace(/[^a-zA-Z0-9가-힣]+/g, "-") || "project"}.json`;
    downloadTextFile(fileName, serializeWorkspaceBackup(workspace));
  }

  async function importWorkspaceFile(file: File | undefined) {
    if (!file) return;
    const raw = await file.text();
    const parsed = parseWorkspaceBackup(raw);
    if (!parsed.ok) {
      setPendingBackupImport(null);
      setBackupMessage(parsed.error);
      return;
    }
    setPendingBackupImport({
      exportedAt: parsed.exportedAt,
      workspace: parsed.workspace,
      validation: parsed.validation,
    });
    setBackupMessage(t("backup.parsed"));
  }

  function applyBackupMerge() {
    if (!pendingBackupImport) return;
    const now = new Date().toISOString();
    const nextWorkspace = workspace
      ? mergeWorkspaceBackup(workspace, pendingBackupImport.workspace, now)
      : replaceWorkspaceFromBackup(pendingBackupImport.workspace, now);
    if (commitWorkspace(nextWorkspace, t("backup.mergeDone"))) {
      setPendingBackupImport(null);
      setBackupMessage(
        validateWorkspace(nextWorkspace).isExportSafe
          ? t("backup.mergeDone")
          : t("backup.mergeWithErrors", { count: validateWorkspace(nextWorkspace).errors.length }),
      );
    }
  }

  function applyBackupReplace() {
    if (!pendingBackupImport) return;
    const nextWorkspace = replaceWorkspaceFromBackup(pendingBackupImport.workspace, new Date().toISOString());
    if (commitWorkspace(nextWorkspace, t("backup.replaceDone"))) {
      setPendingBackupImport(null);
      setBackupMessage(
        validateWorkspace(nextWorkspace).isExportSafe
          ? t("backup.replaceDone")
          : t("backup.replaceWithErrors", { count: validateWorkspace(nextWorkspace).errors.length }),
      );
      navigateTo(projectRoute(nextWorkspace.project.id, "review"));
    }
  }

  function cancelBackupImport() {
    setPendingBackupImport(null);
    setBackupMessage(t("backup.cancelled"));
  }

  function previewAutosaveSnapshot(snapshotId: string) {
    const result = restoreAutosaveSnapshot(window.localStorage, snapshotId);
    if (!result.ok) {
      setPendingSnapshotRestore(null);
      setBackupMessage(result.error);
      return;
    }
    setPendingSnapshotRestore({
      snapshotId,
      createdAt: result.snapshot.createdAt,
      workspace: result.workspace,
      validation: result.validation,
    });
    setBackupMessage(
      result.validation.isExportSafe
        ? t("backup.autosavePreviewReady")
        : t("backup.autosavePreviewErrors", { count: result.validation.errors.length }),
    );
  }

  function applyAutosaveSnapshot() {
    if (!pendingSnapshotRestore) return;
    const nextWorkspace = {
      ...pendingSnapshotRestore.workspace,
      updatedAt: new Date().toISOString(),
    };
    if (commitWorkspace(nextWorkspace, t("backup.autosaveRestored"))) {
      setPendingSnapshotRestore(null);
      setBackupMessage(t("backup.autosaveRestored"));
      navigateTo(projectRoute(nextWorkspace.project.id, "review"));
    }
  }

  function validateProjectForm(): string | null {
    const errors: string[] = [];
    if (!projectName.trim()) errors.push(t("form.projectNameRequired"));
    if (!sourceText.trim()) errors.push(t("form.sourceRequired"));
    const duplicateProject = projectSummaries.find(
      (project) =>
        project.id !== workspace?.project.id &&
        project.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR") ===
          projectName.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"),
    );
    if (duplicateProject) errors.push(t("form.duplicateProject"));
    return errors.length ? errors.join(" ") : null;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="App X-Ray sections">
        <div className="brand">
          <span className="brand-mark">XR</span>
          <div>
            <strong>App X-Ray</strong>
            <small>See your app before AI builds it.</small>
          </div>
        </div>
        <label className="language-selector">
          {t("language.label")}
          <select value={language} onChange={(event) => updateLanguage(event.target.value as AppLanguage)}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <nav>
          <a href="#/projects/new">{t("nav.newProject")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "review") : "#/projects"}>{t("nav.review")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "app-map") : "#/projects"}>{t("nav.appMap")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "data-map") : "#/projects"}>{t("nav.dataMap")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "issues") : "#/projects"}>{t("nav.issues")}</a>
          <a href="#template">{t("nav.template")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "prompts") : "#/projects"}>{t("nav.prompts")}</a>
          <a href="#build-plan">{t("nav.buildPlan")}</a>
          <a href={workspace ? projectRoute(workspace.project.id, "export") : "#/projects"}>{t("nav.export")}</a>
          <a href="#backup">{t("nav.backup")}</a>
          <a href="#/settings/ai">{t("nav.aiSettings")}</a>
        </nav>
        <div className="project-switcher" aria-label={t("projectSwitcher.label")}>
          <strong>{t("projectSwitcher.title")}</strong>
          {projectSummaries.length === 0 ? <small>{t("projectSwitcher.empty")}</small> : null}
          {projectSummaries.map((project) => (
            <div className={`project-item ${workspace?.project.id === project.id ? "active" : ""}`} key={project.id}>
              <button type="button" onClick={() => openProject(project.id, "review")}>{project.name}</button>
              <button
                className={`secondary icon-button ${pendingDeleteProjectId === project.id ? "pending-delete" : ""}`}
                type="button"
                aria-label={t("project.deleteAria", { name: project.name })}
                onClick={() => deleteProject(project.id)}
              >
                {pendingDeleteProjectId === project.id ? t("project.deleteConfirm") : "×"}
              </button>
            </div>
          ))}
        </div>
        <div className="status-card">
          <span>{t("statusCard.title")}</span>
          <strong>{confirmedCounts} / {totalCounts}</strong>
          <small>{t("statusCard.help")}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{workspace?.project.name ?? t("topbar.emptyTitle")}</h1>
            <p>{t("topbar.subtitle")}</p>
          </div>
          <div className="topbar-actions">
            <button className="secondary" type="button" onClick={resetWorkspace}>{t("topbar.deleteCurrent")}</button>
            <button type="button" disabled={analysisRunState.status === "running"} onClick={() => void runAnalysis()}>
              {analysisButtonLabel(aiConfig.provider, Boolean(workspace), analysisRunState.status === "running", t)}
            </button>
          </div>
        </header>

        {saveError ? <p className="notice error">{t("save.errorPrefix", { message: saveError })}</p> : null}
        {saveStatus ? <p className="notice info" role="status">{saveStatus}</p> : null}
        {analysisRunState.status === "running" ? <p className="notice info" role="status">{t("analysis.runningNotice")}</p> : null}
        {analysisRunState.status === "success" ? <p className="notice info" role="status">{analysisRunState.message}</p> : null}
        {analysisRunState.status === "validation-failed" || analysisRunState.status === "provider-error" ? (
          <p className="notice error">{analysisRunState.message}</p>
        ) : null}

        <section className="panel intake" id="new-project">
          <div className="section-heading">
            <span>{t("source.section")}</span>
            <h2>{t("source.title")}</h2>
          </div>
          <div className="form-grid">
            <label>
              {t("source.projectName")}
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <label>
              {t("source.type")}
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceDocument["sourceType"])}>
                <option value="text">{getSourceTypeLabel(language, "text")}</option>
                <option value="markdown">Markdown</option>
                <option value="txt">{language === "ko" ? "TXT 파일" : "TXT file"}</option>
                <option value="csv">{language === "ko" ? "CSV 파일" : "CSV file"}</option>
                <option value="json">{language === "ko" ? "JSON 파일" : "JSON file"}</option>
                <option value="pdf">{getSourceTypeLabel(language, "pdf")}</option>
              </select>
            </label>
            <label>
              {t("source.ideaPrd")}
              <textarea value={sourceText} onChange={(event) => updateSourceText(event.target.value)} rows={7} />
            </label>
            <label>
              {t("source.importFile")}
              <input
                accept=".md,.markdown,.txt,.csv,.json,.pdf"
                aria-label={t("source.importFile")}
                type="file"
                onChange={(event) => void importSourceFile(event.target.files?.[0])}
              />
            </label>
          </div>
          {formError ? <p className="notice error">{formError}</p> : null}
          {sourceImportMessage ? <p className={`notice ${sourceImportSeverity}`}>{sourceImportMessage}</p> : null}
          <div className="button-row">
            <button type="button" onClick={createProject}>{t("source.saveProject")}</button>
            {workspace ? <button className="secondary" type="button" onClick={saveSourceVersion}>{t("source.saveCurrent")}</button> : null}
            <button className="secondary" type="button" disabled={analysisRunState.status === "running"} onClick={() => void runAnalysis()}>
              {aiConfig.provider === "mock" ? t("source.saveAndMock") : t("source.saveAndProvider", { provider: getAiProviderMetadata(aiConfig.provider).label })}
            </button>
          </div>
          <div className="source-meta">
            <span>{t("source.typeMeta", { type: sourceTypeLabel(sourceType, language) })}</span>
            <span>{t("source.versionCount", { count: workspace?.sourceDocuments.length ?? 0 })}</span>
            <span>{t("source.currentVersion", { version: latestSourceDocument?.version ?? 0 })}</span>
            {latestSourceDocument ? <span>{t("source.savedAt", { time: formatDateTime(latestSourceDocument.createdAt, language) })}</span> : null}
            {lastImportedAt ? <span>{t("source.lastImported", { time: formatDateTime(lastImportedAt, language) })}</span> : null}
            {workspace?.lastAnalysis ? (
              <>
                <span>{t("source.lastAnalysis", { version: workspace.lastAnalysis.sourceVersion })}</span>
                <span>{t("source.newSuggestions", { count: workspace.lastAnalysis.addedSuggestedCount })}</span>
                <span>{t("source.refreshedSuggestions", { count: workspace.lastAnalysis.refreshedSuggestedCount })}</span>
                <span>{t("source.preservedConfirmed", { count: workspace.lastAnalysis.preservedConfirmedCount })}</span>
                <span>{t("source.preservedDecisions", { count: workspace.lastAnalysis.preservedReviewDecisionCount ?? 0 })}</span>
              </>
            ) : null}
          </div>
          {workspace?.analysisHistory?.length ? (
            <div className="analysis-history" aria-label={language === "ko" ? "분석 이력" : "Analysis history"}>
              {workspace.analysisHistory.slice(0, 3).map((analysis) => (
                <span key={analysis.runId}>
                  {t("source.historyItem", {
                    version: analysis.sourceVersion,
                    added: analysis.addedSuggestedCount,
                    refreshed: analysis.refreshedSuggestedCount,
                    preserved: analysis.preservedConfirmedCount,
                  })}
                </span>
              ))}
            </div>
          ) : null}
          {workspace?.lastStructureDiff ? <DiffSummary diff={workspace.lastStructureDiff} t={t} /> : null}
          {workspace?.lastStructureDiff ? <DiffDetail diff={workspace.lastStructureDiff} t={t} /> : null}
        </section>

        {workspace ? (
          <>
            <ReviewPanel
              analysisChanges={workspace.lastAnalysis?.changes}
              analysisSummary={workspace.lastAnalysis}
              canUndoStatus={statusHistory.length > 0}
              focusedValidationIssue={focusedValidationIssue}
              objects={workspace.objects}
              structureDiff={workspace.lastStructureDiff}
              validationIssues={validationIssues}
              language={language}
              t={t}
              onBulkStatus={updateObjectsStatus}
              onUndoStatus={undoStatusDecision}
              onStatus={updateObjectStatus}
              onEdit={editObject}
            />

            <MapPanels
              dataFields={workspace.objects.dataFields}
              dataObjects={workspace.objects.dataObjects}
              dataRelations={workspace.objects.dataRelations}
              features={workspace.objects.features}
              screens={workspace.objects.screens}
              language={language}
              t={t}
            />

            <section className="panel" id="missing">
              <div className="section-heading">
                <span>{t("nav.issues")}</span>
                <h2>{language === "ko" ? "결정 필요 항목" : "Decisions Needed"}</h2>
              </div>
              <MissingParts issues={workspace.objects.issues} language={language} t={t} onTogglePrompt={toggleIssuePrompt} />
            </section>

            <section className="panel" id="template">
              <div className="section-heading">
                <span>{t("template.section")}</span>
                <h2>{t("template.title")}</h2>
              </div>
              <div className="template-preview">
                <div>
                  <strong>{fieldPowerTemplate.name}</strong>
                  <p>{fieldPowerTemplate.description}</p>
                  <small>
                    {t("template.summary", {
                      screens: fieldPowerTemplate.screens.length,
                      dataObjects: fieldPowerTemplate.dataObjects.length,
                      flows: fieldPowerTemplate.flows.length,
                    })}
                  </small>
                </div>
                <button type="button" onClick={applyBuiltInTemplate}>{t("template.applySuggested")}</button>
              </div>
              {templateMessage ? <p className="notice info">{templateMessage}</p> : null}
              {workspace.appliedTemplates?.length ? (
                <div className="applied-template-list">
                  {workspace.appliedTemplates.map((template) => (
                    <span key={`${template.templateId}-${template.appliedAt}`}>{template.name} v{template.version}</span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="panel" id="prompt">
              <div className="section-heading">
                <span>{t("prompt.section")}</span>
                <h2>{t("prompt.title", { target: promptLabel(promptTarget) })}</h2>
              </div>
              <div className="segmented prompt-target" aria-label={t("prompt.targetAria")}>
                <button className={promptTarget === "codex" ? "active" : ""} type="button" onClick={() => setPromptTarget("codex")}>Codex</button>
                <button className={promptTarget === "cursor" ? "active" : ""} type="button" onClick={() => setPromptTarget("cursor")}>Cursor</button>
                <button className={promptTarget === "lovable" ? "active" : ""} type="button" onClick={() => setPromptTarget("lovable")}>Lovable</button>
                <button className={promptTarget === "replit" ? "active" : ""} type="button" onClick={() => setPromptTarget("replit")}>Replit</button>
                <button className={promptTarget === "bolt" ? "active" : ""} type="button" onClick={() => setPromptTarget("bolt")}>Bolt</button>
              </div>
              <label className="prompt-step-select">
                {t("prompt.stepSelect")}
                <select value={selectedBuildStep} onChange={(event) => setSelectedBuildStep(event.target.value)}>
                  <option value="">{t("prompt.allStructure")}</option>
                  {workspace.buildPlanSuggestions.map((step) => (
                    <option key={step.tempId} value={step.tempId}>{step.title}</option>
                  ))}
                </select>
              </label>
              <pre className="preview">{buildPrompt}</pre>
            </section>

            <section className="panel" id="build-plan">
              <div className="section-heading">
                <span>{t("buildPlan.section")}</span>
                <h2>{t("buildPlan.title")}</h2>
              </div>
              <BuildPlanPreview steps={workspace.buildPlanSuggestions} t={t} />
            </section>

            <ExportPanel
              activeExport={activeExport}
              onExportChange={setActiveExport}
              onJumpToIssue={jumpToValidationIssue}
              onRepairIssue={repairValidationIssue}
              language={language}
              t={t}
              workspace={workspace}
            />

            <section className="panel" id="backup">
              <div className="section-heading">
                <span>{t("backup.section")}</span>
                <h2>{t("backup.title")}</h2>
              </div>
              <div className="button-row">
                <button type="button" onClick={downloadWorkspaceBackup}>{t("backup.saveJson")}</button>
                <label className="file-button">
                  {t("backup.importJson")}
                  <input accept=".json" type="file" onChange={(event) => void importWorkspaceFile(event.target.files?.[0])} />
                </label>
              </div>
              <p className="muted export-file-name">{t("backup.note")}</p>
              {backupMessage ? <p className="notice info">{backupMessage}</p> : null}
              {pendingBackupImport ? (
                <div className="recovery-preview" aria-label={t("backup.previewLabel")}>
                  <div>
                    <strong>{pendingBackupImport.workspace.project.name}</strong>
                    <p>{t("backup.exportedAt", { raw: pendingBackupImport.exportedAt, time: formatDateTime(pendingBackupImport.exportedAt, language) })}</p>
                    <p>{validationStatusLabel(pendingBackupImport.validation, t)}</p>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={applyBackupMerge}>{t("backup.merge")}</button>
                    <button className="danger" type="button" onClick={applyBackupReplace}>{t("backup.replace")}</button>
                    <button className="secondary" type="button" onClick={cancelBackupImport}>{t("backup.cancel")}</button>
                  </div>
                </div>
              ) : null}
              {snapshotSummaries.length ? (
                <div className="recovery-list" aria-label={t("backup.autosaveList")}>
                  {snapshotSummaries.map((snapshot) => (
                    <article className="recovery-preview" key={snapshot.id}>
                      <div>
                        <strong>{snapshot.projectName}</strong>
                        <p>{snapshot.createdAt} · {formatDateTime(snapshot.createdAt, language)}</p>
                        <p>{validationStatusLabel(snapshot.validation, t)}</p>
                      </div>
                      <button
                        aria-label={`${snapshot.projectName} ${snapshot.createdAt} ${t("backup.restorePreview")}`}
                        className="secondary"
                        type="button"
                        onClick={() => previewAutosaveSnapshot(snapshot.id)}
                      >
                        {t("backup.restorePreview")}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted export-file-name">{t("backup.noAutosave")}</p>
              )}
              {pendingSnapshotRestore ? (
                <div className="recovery-preview" aria-label={t("backup.autosavePreview")}>
                  <div>
                    <strong>{pendingSnapshotRestore.workspace.project.name}</strong>
                    <p>{t("backup.savedAt", { raw: pendingSnapshotRestore.createdAt, time: formatDateTime(pendingSnapshotRestore.createdAt, language) })}</p>
                    <p>{validationStatusLabel(pendingSnapshotRestore.validation, t)}</p>
                  </div>
                  <button type="button" onClick={applyAutosaveSnapshot}>{t("backup.restoreThis")}</button>
                </div>
              ) : null}
            </section>

            {aiSettingsPanel}
          </>
        ) : route.name === "aiSettings" ? (
          aiSettingsPanel
        ) : (
          <section className="empty-state">
            <h2>{t("empty.title")}</h2>
            <p>{saveError ? t("empty.withError") : t("empty.default")}</p>
          </section>
        )}
      </section>
    </main>
  );
}

function DiffSummary({ diff, t }: { diff: NonNullable<ProjectWorkspace["lastStructureDiff"]>; t: Translator }) {
  return (
    <div className="diff-summary" aria-label={t("diff.summaryAria")}>
      <strong>{t("diff.summaryTitle")}</strong>
      <span>{t("diff.added")} {diff.counts.added}</span>
      <span>{t("diff.changed")} {diff.counts.changed}</span>
      <span>{t("diff.statusChanged")} {diff.counts.status_changed}</span>
      <span>{t("diff.preservedConfirmed")} {diff.counts.preserved_confirmed}</span>
    </div>
  );
}

function DiffDetail({ diff, t }: { diff: NonNullable<ProjectWorkspace["lastStructureDiff"]>; t: Translator }) {
  if (diff.entries.length === 0) return null;

  const labels = {
    added: t("diff.added"),
    removed: t("diff.removed"),
    changed: t("diff.changed"),
    status_changed: t("diff.statusChanged"),
    preserved_confirmed: t("diff.preservedConfirmed"),
  };

  return (
    <div className="diff-detail" aria-label={t("diff.detailAria")}>
      {diff.entries.slice(0, 12).map((entry) => (
        <span key={`${entry.bucket}-${entry.key}-${entry.diffType}`}>
          {labels[entry.diffType]} · {entry.bucket} · {entry.objectId}
        </span>
      ))}
      {diff.entries.length > 12 ? <span>{t("diff.more", { count: diff.entries.length - 12 })}</span> : null}
    </div>
  );
}

function BuildPlanPreview({ steps, t }: { steps: ProjectWorkspace["buildPlanSuggestions"]; t: Translator }) {
  if (steps.length === 0) return <p className="muted">{t("buildPlan.empty")}</p>;

  return (
    <div className="build-plan-list">
      {steps.map((step, index) => (
        <article className="build-plan-step" key={step.tempId}>
          <span>{t("buildPlan.suggestion", { index: index + 1 })}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.description}</p>
            {step.completionCriteria?.length ? (
              <ul>
                {step.completionCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
              </ul>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function countAll(objects: XraySuggestionSet): number {
  return Object.values(objects).reduce((total, collection) => total + collection.length, 0);
}

function countConfirmed(objects: XraySuggestionSet): number {
  return Object.values(objects).reduce(
    (total, collection: BaseXrayObject[]) => total + collection.filter(isConfirmedXrayObject).length,
    0,
  );
}

function findWorkspaceObject(workspace: ProjectWorkspace, bucket: ObjectBucket, id: string): XrayObject | undefined {
  return (workspace.objects[bucket] as XrayObject[]).find((object) => object.id === id);
}

function validationStatusLabel(validation: ReturnType<typeof validateWorkspace>, t: Translator): string {
  if (validation.isExportSafe) return t("backup.validationOk", { warnings: validation.warnings.length });
  return t("backup.validationBlocked", { errors: validation.errors.length, warnings: validation.warnings.length });
}

function formatDateTime(value: string, language: AppLanguage): string {
  return formatDateTimeForLanguage(language, value);
}

function sourceTypeLabel(sourceType: SourceDocument["sourceType"], language: AppLanguage): string {
  return getSourceTypeLabel(language, sourceType);
}

function analysisButtonLabel(provider: AiProviderName, hasWorkspace: boolean, isRunning: boolean, t: Translator): string {
  if (isRunning) return t("analysis.runningButton");
  if (provider === "mock") return hasWorkspace ? t("analysis.mockReanalyze") : t("analysis.mockAnalyze");
  const providerLabel = getAiProviderMetadata(provider).label;
  return hasWorkspace ? t("analysis.providerReanalyze", { provider: providerLabel }) : t("analysis.providerAnalyze", { provider: providerLabel });
}

function sectionIdForRoute(section: string): string {
  return {
    source: "new-project",
    review: "review",
    "app-map": "app-map",
    "data-map": "data-map",
    issues: "missing",
    prompts: "prompt",
    export: "export",
  }[section] ?? "new-project";
}

function promptLabel(target: ExtendedBuildPromptTarget): string {
  return {
    codex: "Codex",
    cursor: "Cursor",
    lovable: "Lovable",
    replit: "Replit",
    bolt: "Bolt",
  }[target];
}

function defaultProjectName(language: AppLanguage): string {
  return language === "ko" ? "현장 전력설비 관리 앱" : "Field Operations App";
}
