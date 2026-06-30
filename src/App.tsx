import { useEffect, useMemo, useState } from "react";
import { mockAiProviderAdapter, validateAiAnalysisResult } from "./ai/adapter.js";
import { analyzeWithHttpProvider } from "./ai/http-provider.js";
import { AI_PROVIDER_REGISTRY, getAiProviderMetadata } from "./ai/provider-registry.js";
import { DEFAULT_AI_PROVIDER_CONFIG, loadAiProviderConfig, saveAiProviderConfig, type AiProviderConfig, type AiProviderName } from "./ai/settings.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { MapPanels, MissingParts } from "./components/MapPanels.js";
import { type EditableXrayObject, type ObjectBucket, ReviewPanel } from "./components/ReviewPanel.js";
import { convertAiAnalysisToXrayObjects } from "./domain/convert.js";
import { compareSuggestionSets } from "./domain/diff.js";
import {
  applyStatusDecisionToSuggestionSet,
  editXrayObject,
  mergeAiSuggestionsPreservingConfirmed,
  type ReviewStatusDecisionGroup,
  summarizeSuggestionMergeImpact,
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
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(() => initialLoad.activeWorkspace);
  const [projectSummaries, setProjectSummaries] = useState(() => summarizeProjects(initialLoad.collection));
  const [projectName, setProjectName] = useState(workspace?.project.name ?? "현장 전력설비 관리 앱");
  const [sourceText, setSourceText] = useState(workspace?.sourceDocuments.at(0)?.content ?? DEFAULT_PRD);
  const [sourceType, setSourceType] = useState<SourceDocument["sourceType"]>(workspace?.sourceDocuments.at(0)?.sourceType ?? "text");
  const [sourceImportMessage, setSourceImportMessage] = useState<string | null>(null);
  const [sourceImportSeverity, setSourceImportSeverity] = useState<"info" | "error">("info");
  const [lastImportedAt, setLastImportedAt] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<ExportType>("markdown");
  const [promptTarget, setPromptTarget] = useState<ExtendedBuildPromptTarget>("codex");
  const [selectedBuildStep, setSelectedBuildStep] = useState("");
  const [saveError, setSaveError] = useState<string | null>(initialLoad.error ?? null);
  const [saveStatus, setSaveStatus] = useState<string | null>(initialLoad.activeWorkspace ? "로컬 프로젝트를 불러왔습니다." : null);
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
      setSaveStatus(result.error ? null : "로컬 저장됨");
      if (!snapshotResult.ok) {
        setBackupMessage(snapshotResult.error);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장할 수 없습니다.");
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
        <span>AI 설정</span>
        <h2>내 API Key 연결 준비</h2>
      </div>
      <p className="muted">API Key는 브라우저 로컬 저장소에만 저장됩니다. export나 prompt에는 포함되지 않습니다.</p>
      <div className="form-grid settings-grid">
        <label>
          AI 제공자
          <select value={aiConfig.provider} onChange={(event) => updateAiProvider(event.target.value as AiProviderName)}>
            {AI_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.provider} value={provider.provider}>{provider.label}</option>
            ))}
          </select>
        </label>
        <label>
          모델 이름
          <input value={aiConfig.modelName} onChange={(event) => updateAiConfig({ modelName: event.target.value })} />
        </label>
        <label>
          API Key
          <input
            placeholder={aiConfig.apiKeyPresent ? "저장된 key 있음" : "브라우저 로컬에 저장"}
            type="password"
            value={aiConfig.apiKey ?? ""}
            onChange={(event) => updateAiConfig({ apiKey: event.target.value })}
          />
        </label>
      </div>
      <p className="muted export-file-name">{getAiProviderMetadata(aiConfig.provider).description}</p>
      <div className="button-row">
        <button type="button" onClick={saveAiSettings}>설정 저장</button>
        <button className="secondary" type="button" onClick={() => setAiConfig(DEFAULT_AI_PROVIDER_CONFIG)}>Mock으로 되돌리기</button>
      </div>
      {aiConfig.lastValidatedAt ? <p className="muted export-file-name">최근 확인: {formatDateTime(aiConfig.lastValidatedAt)}</p> : null}
      {aiSettingsMessage ? <p className="notice info">{aiSettingsMessage}</p> : null}
    </section>
  );

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
    setSaveStatus("로컬 저장됨");
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
    let analysis: Awaited<ReturnType<typeof mockAiProviderAdapter.analyze>>;
    try {
      if (aiConfig.provider === "mock") {
        analysis = await mockAiProviderAdapter.analyze({ sourceDocument });
      } else {
        const providerResult = await analyzeWithHttpProvider(aiConfig, { sourceDocument });
        if (!providerResult.ok) {
          setAnalysisRunState({
            status: "provider-error",
            message: providerResult.error,
          });
          return;
        }
        analysis = providerResult.result;
      }
    } catch (error) {
      setAnalysisRunState({
        status: "provider-error",
        message: error instanceof Error ? error.message : "AI 분석 요청에 실패했습니다.",
      });
      return;
    }
    const validation = validateAiAnalysisResult(analysis);
    if (!validation.ok) {
      setAnalysisRunState({
        status: "validation-failed",
        message: `AI 분석 결과 검증 실패: ${validation.errors.join(" / ")}`,
      });
      return;
    }

    const converted = convertAiAnalysisToXrayObjects({
      project: versionedWorkspace.project,
      sourceDocument,
      analysis: validation.result,
      now,
    });
    const mergeImpact = summarizeSuggestionMergeImpact(versionedWorkspace.objects, converted);
    const mergedObjects = mergeAiSuggestionsPreservingConfirmed(versionedWorkspace.objects, converted);
    const structureDiff = compareSuggestionSets(versionedWorkspace.objects, mergedObjects);
    const lastAnalysis = {
      runId: `analysis_${crypto.randomUUID()}`,
      sourceDocumentId: sourceDocument.id,
      sourceVersion: sourceDocument.version,
      analyzedAt: now,
      ...mergeImpact,
    };

    const nextWorkspace = {
      ...versionedWorkspace,
      project: {
        ...versionedWorkspace.project,
        appTypes: validation.result.summary.appTypes,
        updatedAt: now,
      },
      objects: mergedObjects,
      buildPlanSuggestions: converted.buildPlanSuggestions,
      lastAnalysis,
      analysisHistory: [lastAnalysis, ...(versionedWorkspace.analysisHistory ?? [])].slice(0, 10),
      lastStructureDiff: structureDiff,
      updatedAt: now,
    };
    if (commitWorkspace(nextWorkspace, "Mock 분석 완료")) {
      setAnalysisRunState({ status: "success", message: "AI 분석 결과를 suggested 구조로 반영했습니다." });
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
    if (workspace && !window.confirm("현재 로컬 프로젝트를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }
    if (!workspace) return;
    const result = repository.deleteWorkspace(workspace.project.id);
    setWorkspace(result.activeWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    if (!result.activeWorkspace) {
      setProjectName("현장 전력설비 관리 앱");
      setSourceText(DEFAULT_PRD);
    }
    navigateTo(projectOrListRoute(result.activeWorkspace?.project.id, "review"));
  }

  function openProject(projectId: string, section: ProjectRouteSection = "review") {
    const result = repository.setActiveProject(projectId);
    setWorkspace(result.workspace);
    setSaveError(result.error ?? null);
    setSaveStatus(result.error ? null : "로컬 프로젝트를 열었습니다.");
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
    setSaveStatus("로컬 프로젝트를 삭제했습니다.");
    if (!result.activeWorkspace) {
      setProjectName("현장 전력설비 관리 앱");
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
    commitWorkspace(nextWorkspace, "로컬 저장됨");
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
    setSourceImportMessage(`${result.fileName} 원문을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.`);
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
        ? `${fieldPowerTemplate.name}을 suggested 구조로 추가했습니다.`
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
    setAiSettingsMessage(result.ok ? "AI 설정을 이 브라우저에 저장했습니다." : result.error);
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
    setBackupMessage("백업 내용을 확인했습니다. 병합, 교체, 취소 중 하나를 선택하세요.");
  }

  function applyBackupMerge() {
    if (!pendingBackupImport) return;
    const now = new Date().toISOString();
    const nextWorkspace = workspace
      ? mergeWorkspaceBackup(workspace, pendingBackupImport.workspace, now)
      : replaceWorkspaceFromBackup(pendingBackupImport.workspace, now);
    if (commitWorkspace(nextWorkspace, "workspace 백업을 병합했습니다.")) {
      setPendingBackupImport(null);
      setBackupMessage(
        validateWorkspace(nextWorkspace).isExportSafe
          ? "workspace 백업을 병합했습니다."
          : `workspace를 병합했지만 내보내기 전에 고칠 것 ${validateWorkspace(nextWorkspace).errors.length}개가 있습니다.`,
      );
    }
  }

  function applyBackupReplace() {
    if (!pendingBackupImport) return;
    const nextWorkspace = replaceWorkspaceFromBackup(pendingBackupImport.workspace, new Date().toISOString());
    if (commitWorkspace(nextWorkspace, "workspace 백업으로 교체했습니다.")) {
      setPendingBackupImport(null);
      setBackupMessage(
        validateWorkspace(nextWorkspace).isExportSafe
          ? "workspace 백업으로 교체했습니다."
          : `workspace로 교체했지만 내보내기 전에 고칠 것 ${validateWorkspace(nextWorkspace).errors.length}개가 있습니다.`,
      );
      navigateTo(projectRoute(nextWorkspace.project.id, "review"));
    }
  }

  function cancelBackupImport() {
    setPendingBackupImport(null);
    setBackupMessage("workspace 백업 불러오기를 취소했습니다.");
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
        ? "자동 저장 기록을 미리 봅니다. 복원하려면 확인 버튼을 누르세요."
        : `자동 저장 기록에 내보내기 전에 고칠 것 ${result.validation.errors.length}개가 있습니다.`,
    );
  }

  function applyAutosaveSnapshot() {
    if (!pendingSnapshotRestore) return;
    const nextWorkspace = {
      ...pendingSnapshotRestore.workspace,
      updatedAt: new Date().toISOString(),
    };
    if (commitWorkspace(nextWorkspace, "자동 저장 기록으로 복원했습니다.")) {
      setPendingSnapshotRestore(null);
      setBackupMessage("자동 저장 기록으로 복원했습니다.");
      navigateTo(projectRoute(nextWorkspace.project.id, "review"));
    }
  }

  function validateProjectForm(): string | null {
    const errors: string[] = [];
    if (!projectName.trim()) errors.push("프로젝트 이름을 입력하세요.");
    if (!sourceText.trim()) errors.push("아이디어나 PRD 원문을 입력하세요.");
    const duplicateProject = projectSummaries.find(
      (project) =>
        project.id !== workspace?.project.id &&
        project.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR") ===
          projectName.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"),
    );
    if (duplicateProject) errors.push("같은 이름의 로컬 프로젝트가 이미 있습니다.");
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
        <nav>
          <a href="#/projects/new">새 프로젝트</a>
          <a href={workspace ? projectRoute(workspace.project.id, "review") : "#/projects"}>분석 검토</a>
          <a href={workspace ? projectRoute(workspace.project.id, "app-map") : "#/projects"}>앱 지도</a>
          <a href={workspace ? projectRoute(workspace.project.id, "data-map") : "#/projects"}>정보 구조</a>
          <a href={workspace ? projectRoute(workspace.project.id, "issues") : "#/projects"}>빠진 것</a>
          <a href="#template">템플릿</a>
          <a href={workspace ? projectRoute(workspace.project.id, "prompts") : "#/projects"}>빌드 프롬프트</a>
          <a href="#build-plan">빌드 순서</a>
          <a href={workspace ? projectRoute(workspace.project.id, "export") : "#/projects"}>내보내기</a>
          <a href="#backup">백업</a>
          <a href="#/settings/ai">AI 설정</a>
        </nav>
        <div className="project-switcher" aria-label="로컬 프로젝트 목록">
          <strong>로컬 프로젝트</strong>
          {projectSummaries.length === 0 ? <small>아직 저장된 프로젝트가 없습니다.</small> : null}
          {projectSummaries.map((project) => (
            <div className={`project-item ${workspace?.project.id === project.id ? "active" : ""}`} key={project.id}>
              <button type="button" onClick={() => openProject(project.id, "review")}>{project.name}</button>
              <button
                className={`secondary icon-button ${pendingDeleteProjectId === project.id ? "pending-delete" : ""}`}
                type="button"
                aria-label={`${project.name} 삭제`}
                onClick={() => deleteProject(project.id)}
              >
                {pendingDeleteProjectId === project.id ? "삭제 확인" : "×"}
              </button>
            </div>
          ))}
        </div>
        <div className="status-card">
          <span>확정 구조</span>
          <strong>{confirmedCounts} / {totalCounts}</strong>
          <small>기본 export에는 확정/수정 확정만 포함됩니다.</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{workspace?.project.name ?? "아이디어를 앱 구조도로 바꾸기"}</h1>
            <p>AI는 초안을 제안하고, 사용자가 확정한 구조만 export됩니다.</p>
          </div>
          <div className="topbar-actions">
            <button className="secondary" type="button" onClick={resetWorkspace}>현재 프로젝트 삭제</button>
            <button type="button" disabled={analysisRunState.status === "running"} onClick={() => void runAnalysis()}>
              {analysisButtonLabel(aiConfig.provider, Boolean(workspace), analysisRunState.status === "running")}
            </button>
          </div>
        </header>

        {saveError ? <p className="notice error">로컬 저장 실패: {saveError}</p> : null}
        {saveStatus ? <p className="notice info" role="status">{saveStatus}</p> : null}
        {analysisRunState.status === "running" ? <p className="notice info" role="status">AI 분석을 실행 중입니다.</p> : null}
        {analysisRunState.status === "success" ? <p className="notice info" role="status">{analysisRunState.message}</p> : null}
        {analysisRunState.status === "validation-failed" || analysisRunState.status === "provider-error" ? (
          <p className="notice error">{analysisRunState.message}</p>
        ) : null}

        <section className="panel intake" id="new-project">
          <div className="section-heading">
            <span>새 프로젝트</span>
            <h2>원문 입력</h2>
          </div>
          <div className="form-grid">
            <label>
              프로젝트 이름
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <label>
              원문 종류
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceDocument["sourceType"])}>
                <option value="text">일반 텍스트</option>
                <option value="markdown">Markdown</option>
                <option value="txt">TXT 파일</option>
                <option value="csv">CSV 파일</option>
                <option value="json">JSON 파일</option>
                <option value="pdf">PDF 지원 예정</option>
              </select>
            </label>
            <label>
              아이디어 / PRD
              <textarea value={sourceText} onChange={(event) => updateSourceText(event.target.value)} rows={7} />
            </label>
            <label>
              원문 파일 가져오기
              <input
                accept=".md,.markdown,.txt,.csv,.json,.pdf"
                aria-label="원문 파일 가져오기"
                type="file"
                onChange={(event) => void importSourceFile(event.target.files?.[0])}
              />
            </label>
          </div>
          {formError ? <p className="notice error">{formError}</p> : null}
          {sourceImportMessage ? <p className={`notice ${sourceImportSeverity}`}>{sourceImportMessage}</p> : null}
          <div className="button-row">
            <button type="button" onClick={createProject}>프로젝트 저장</button>
            {workspace ? <button className="secondary" type="button" onClick={saveSourceVersion}>현재 변경 저장</button> : null}
            <button className="secondary" type="button" disabled={analysisRunState.status === "running"} onClick={() => void runAnalysis()}>
              {aiConfig.provider === "mock" ? "저장하고 Mock 분석" : `저장하고 ${getAiProviderMetadata(aiConfig.provider).label} 분석`}
            </button>
          </div>
          <div className="source-meta">
            <span>원문 종류: {sourceTypeLabel(sourceType)}</span>
            <span>원문 버전: {workspace?.sourceDocuments.length ?? 0}개</span>
            <span>현재 원문 버전: v{latestSourceDocument?.version ?? 0}</span>
            {latestSourceDocument ? <span>저장 시각: {formatDateTime(latestSourceDocument.createdAt)}</span> : null}
            {lastImportedAt ? <span>최근 가져오기: {formatDateTime(lastImportedAt)}</span> : null}
            {workspace?.lastAnalysis ? (
              <>
                <span>최근 분석: v{workspace.lastAnalysis.sourceVersion}</span>
                <span>새 제안 {workspace.lastAnalysis.addedSuggestedCount}</span>
                <span>갱신 제안 {workspace.lastAnalysis.refreshedSuggestedCount}</span>
                <span>보존 확정 {workspace.lastAnalysis.preservedConfirmedCount}</span>
                <span>보존 판정 {workspace.lastAnalysis.preservedReviewDecisionCount ?? 0}</span>
              </>
            ) : null}
          </div>
          {workspace?.analysisHistory?.length ? (
            <div className="analysis-history" aria-label="분석 이력">
              {workspace.analysisHistory.slice(0, 3).map((analysis) => (
                <span key={analysis.runId}>
                  v{analysis.sourceVersion} · 새 {analysis.addedSuggestedCount} · 갱신 {analysis.refreshedSuggestedCount} · 보존 {analysis.preservedConfirmedCount}
                </span>
              ))}
            </div>
          ) : null}
          {workspace?.lastStructureDiff ? <DiffSummary diff={workspace.lastStructureDiff} /> : null}
          {workspace?.lastStructureDiff ? <DiffDetail diff={workspace.lastStructureDiff} /> : null}
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
            />

            <section className="panel" id="missing">
              <div className="section-heading">
                <span>빠진 것</span>
                <h2>결정 필요 항목</h2>
              </div>
              <MissingParts issues={workspace.objects.issues} onTogglePrompt={toggleIssuePrompt} />
            </section>

            <section className="panel" id="template">
              <div className="section-heading">
                <span>템플릿 적용</span>
                <h2>시작 구조 추가</h2>
              </div>
              <div className="template-preview">
                <div>
                  <strong>{fieldPowerTemplate.name}</strong>
                  <p>{fieldPowerTemplate.description}</p>
                  <small>
                    화면 {fieldPowerTemplate.screens.length} · 앱이 저장할 정보 {fieldPowerTemplate.dataObjects.length} · 사용 흐름 {fieldPowerTemplate.flows.length}
                  </small>
                </div>
                <button type="button" onClick={applyBuiltInTemplate}>suggested로 적용</button>
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
                <span>빌드 프롬프트</span>
                <h2>{promptLabel(promptTarget)}용 미리보기</h2>
              </div>
              <div className="segmented prompt-target" aria-label="Prompt target">
                <button className={promptTarget === "codex" ? "active" : ""} type="button" onClick={() => setPromptTarget("codex")}>Codex</button>
                <button className={promptTarget === "cursor" ? "active" : ""} type="button" onClick={() => setPromptTarget("cursor")}>Cursor</button>
                <button className={promptTarget === "lovable" ? "active" : ""} type="button" onClick={() => setPromptTarget("lovable")}>Lovable</button>
                <button className={promptTarget === "replit" ? "active" : ""} type="button" onClick={() => setPromptTarget("replit")}>Replit</button>
                <button className={promptTarget === "bolt" ? "active" : ""} type="button" onClick={() => setPromptTarget("bolt")}>Bolt</button>
              </div>
              <label className="prompt-step-select">
                빌드 순서 선택
                <select value={selectedBuildStep} onChange={(event) => setSelectedBuildStep(event.target.value)}>
                  <option value="">전체 구조</option>
                  {workspace.buildPlanSuggestions.map((step) => (
                    <option key={step.tempId} value={step.tempId}>{step.title}</option>
                  ))}
                </select>
              </label>
              <pre className="preview">{buildPrompt}</pre>
            </section>

            <section className="panel" id="build-plan">
              <div className="section-heading">
                <span>AI 제안 빌드 순서</span>
                <h2>검토용 순서 초안</h2>
              </div>
              <BuildPlanPreview steps={workspace.buildPlanSuggestions} />
            </section>

            <ExportPanel
              activeExport={activeExport}
              onExportChange={setActiveExport}
              onJumpToIssue={jumpToValidationIssue}
              onRepairIssue={repairValidationIssue}
              workspace={workspace}
            />

            <section className="panel" id="backup">
              <div className="section-heading">
                <span>로컬 백업</span>
                <h2>프로젝트 파일로 저장/복원</h2>
              </div>
              <div className="button-row">
                <button type="button" onClick={downloadWorkspaceBackup}>workspace JSON 저장</button>
                <label className="file-button">
                  workspace JSON 불러오기
                  <input accept=".json" type="file" onChange={(event) => void importWorkspaceFile(event.target.files?.[0])} />
                </label>
              </div>
              <p className="muted export-file-name">SQLite/native file 저장은 desktop packaging 단계에서 붙일 수 있도록 repository 경계를 유지합니다.</p>
              {backupMessage ? <p className="notice info">{backupMessage}</p> : null}
              {pendingBackupImport ? (
                <div className="recovery-preview" aria-label="백업 불러오기 미리보기">
                  <div>
                    <strong>{pendingBackupImport.workspace.project.name}</strong>
                    <p>내보낸 시각: {pendingBackupImport.exportedAt} · {formatDateTime(pendingBackupImport.exportedAt)}</p>
                    <p>{validationStatusLabel(pendingBackupImport.validation)}</p>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={applyBackupMerge}>백업 병합</button>
                    <button className="danger" type="button" onClick={applyBackupReplace}>백업으로 교체</button>
                    <button className="secondary" type="button" onClick={cancelBackupImport}>취소</button>
                  </div>
                </div>
              ) : null}
              {snapshotSummaries.length ? (
                <div className="recovery-list" aria-label="자동 저장 기록">
                  {snapshotSummaries.map((snapshot) => (
                    <article className="recovery-preview" key={snapshot.id}>
                      <div>
                        <strong>{snapshot.projectName}</strong>
                        <p>{snapshot.createdAt} · {formatDateTime(snapshot.createdAt)}</p>
                        <p>{validationStatusLabel(snapshot.validation)}</p>
                      </div>
                      <button className="secondary" type="button" onClick={() => previewAutosaveSnapshot(snapshot.id)}>복원 미리보기</button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted export-file-name">아직 자동 저장 기록이 없습니다.</p>
              )}
              {pendingSnapshotRestore ? (
                <div className="recovery-preview" aria-label="자동 저장 복원 미리보기">
                  <div>
                    <strong>{pendingSnapshotRestore.workspace.project.name}</strong>
                    <p>저장 시각: {pendingSnapshotRestore.createdAt} · {formatDateTime(pendingSnapshotRestore.createdAt)}</p>
                    <p>{validationStatusLabel(pendingSnapshotRestore.validation)}</p>
                  </div>
                  <button type="button" onClick={applyAutosaveSnapshot}>이 기록으로 복원</button>
                </div>
              ) : null}
            </section>

            {aiSettingsPanel}
          </>
        ) : route.name === "aiSettings" ? (
          aiSettingsPanel
        ) : (
          <section className="empty-state">
            <h2>아직 저장된 구조가 없습니다.</h2>
            <p>{saveError ? "새 프로젝트로 다시 시작할 수 있습니다." : "새 프로젝트를 만들어 원문을 저장하세요. Mock 분석을 실행하면 화면, 정보 구조, 빠진 것이 나타납니다."}</p>
          </section>
        )}
      </section>
    </main>
  );
}

function DiffSummary({ diff }: { diff: NonNullable<ProjectWorkspace["lastStructureDiff"]> }) {
  return (
    <div className="diff-summary" aria-label="이번 분석에서 바뀐 것">
      <strong>이번 분석에서 바뀐 것</strong>
      <span>새 항목 {diff.counts.added}</span>
      <span>내용 변경 {diff.counts.changed}</span>
      <span>상태 변경 {diff.counts.status_changed}</span>
      <span>확정 보존 {diff.counts.preserved_confirmed}</span>
    </div>
  );
}

function DiffDetail({ diff }: { diff: NonNullable<ProjectWorkspace["lastStructureDiff"]> }) {
  if (diff.entries.length === 0) return null;

  const labels = {
    added: "새 항목",
    removed: "사라진 항목",
    changed: "내용 변경",
    status_changed: "상태 변경",
    preserved_confirmed: "확정 보존",
  };

  return (
    <div className="diff-detail" aria-label="분석 변화 상세">
      {diff.entries.slice(0, 12).map((entry) => (
        <span key={`${entry.bucket}-${entry.key}-${entry.diffType}`}>
          {labels[entry.diffType]} · {entry.bucket} · {entry.objectId}
        </span>
      ))}
      {diff.entries.length > 12 ? <span>외 {diff.entries.length - 12}개</span> : null}
    </div>
  );
}

function BuildPlanPreview({ steps }: { steps: ProjectWorkspace["buildPlanSuggestions"] }) {
  if (steps.length === 0) return <p className="muted">아직 AI가 제안한 빌드 순서가 없습니다.</p>;

  return (
    <div className="build-plan-list">
      {steps.map((step, index) => (
        <article className="build-plan-step" key={step.tempId}>
          <span>제안 {index + 1}</span>
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

function validationStatusLabel(validation: ReturnType<typeof validateWorkspace>): string {
  if (validation.isExportSafe) return `내보내기 가능 · 확인 필요 ${validation.warnings.length}개`;
  return `내보내기 전에 고칠 것 ${validation.errors.length}개 · 확인 필요 ${validation.warnings.length}개`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function sourceTypeLabel(sourceType: SourceDocument["sourceType"]): string {
  return {
    text: "일반 텍스트",
    markdown: "Markdown",
    txt: "TXT",
    csv: "CSV",
    json: "JSON",
    pdf: "PDF 지원 예정",
    imported: "가져온 원문",
  }[sourceType];
}

function analysisButtonLabel(provider: AiProviderName, hasWorkspace: boolean, isRunning: boolean): string {
  if (isRunning) return "AI 분석 중";
  if (provider === "mock") return hasWorkspace ? "Mock 재분석" : "Mock 분석하기";
  const providerLabel = getAiProviderMetadata(provider).label;
  return hasWorkspace ? `${providerLabel} 재분석` : `${providerLabel} 분석하기`;
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
