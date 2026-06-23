import { useEffect, useMemo, useState } from "react";
import { mockAiProviderAdapter, validateAiAnalysisResult } from "./ai/adapter.js";
import { DEFAULT_AI_PROVIDER_CONFIG, loadAiProviderConfig, saveAiProviderConfig, type AiProviderConfig, type AiProviderName } from "./ai/settings.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { MapPanels, MissingParts } from "./components/MapPanels.js";
import { type EditableXrayObject, type ObjectBucket, ReviewPanel } from "./components/ReviewPanel.js";
import { convertAiAnalysisToXrayObjects } from "./domain/convert.js";
import { compareSuggestionSets } from "./domain/diff.js";
import {
  editXrayObject,
  mergeAiSuggestionsPreservingConfirmed,
  summarizeSuggestionMergeImpact,
  updateXrayObjectStatus,
} from "./domain/lifecycle.js";
import { parseAppRoute, projectRoute } from "./domain/routes.js";
import { classifySourceFile } from "./domain/source-import.js";
import { appendSourceDocumentVersion, getLatestSourceDocument } from "./domain/source-documents.js";
import { isConfirmedXrayObject } from "./domain/status.js";
import { applyTemplateToWorkspace } from "./domain/template.js";
import type { BaseXrayObject, SourceDocument, SuggestionStatus, XrayObject, XraySuggestionSet } from "./domain/types.js";
import type { ProjectWorkspace } from "./domain/workspace.js";
import { createEmptySuggestionSet } from "./domain/workspace.js";
import type { ExportType } from "./export/export-content.js";
import { fieldPowerAppSourceDocument } from "./fixtures/field-power-app.js";
import { fieldPowerTemplate } from "./fixtures/field-power-template.js";
import { createBuildPrompt, type ExtendedBuildPromptTarget } from "./prompt/build-prompt.js";
import { createLocalStorageProjectRepository, summarizeProjects } from "./storage/project-repository.js";
import { importWorkspaceBackup, serializeWorkspaceBackup } from "./storage/workspace-backup.js";
import { downloadTextFile } from "./export/export-content.js";

const DEFAULT_PRD = fieldPowerAppSourceDocument.content;

export default function App() {
  const repository = useMemo(() => createLocalStorageProjectRepository(), []);
  const initialLoad = useMemo(() => repository.loadCollectionWithStatus(), [repository]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(() => initialLoad.activeWorkspace);
  const [projectSummaries, setProjectSummaries] = useState(() => summarizeProjects(initialLoad.collection));
  const [projectName, setProjectName] = useState(workspace?.project.name ?? "현장 전력설비 관리 앱");
  const [sourceText, setSourceText] = useState(workspace?.sourceDocuments.at(0)?.content ?? DEFAULT_PRD);
  const [sourceType, setSourceType] = useState<SourceDocument["sourceType"]>(workspace?.sourceDocuments.at(0)?.sourceType ?? "text");
  const [sourceImportMessage, setSourceImportMessage] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<ExportType>("markdown");
  const [promptTarget, setPromptTarget] = useState<ExtendedBuildPromptTarget>("codex");
  const [selectedBuildStep, setSelectedBuildStep] = useState("");
  const [saveError, setSaveError] = useState<string | null>(initialLoad.error ?? null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig>(() => loadAiProviderConfig());
  const [aiSettingsMessage, setAiSettingsMessage] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [route, setRoute] = useState(() => parseAppRoute(window.location.hash));

  useEffect(() => {
    if (!workspace) return;
    try {
      const result = repository.saveWorkspace(workspace);
      setProjectSummaries(summarizeProjects(result.collection));
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장할 수 없습니다.");
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
    if (workspace?.project.id !== route.projectId) openProject(route.projectId);
    const sectionId = sectionIdForRoute(route.section);
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ block: "start" }));
  }, [route, workspace?.project.id]);

  const confirmedCounts = workspace ? countConfirmed(workspace.objects) : 0;
  const totalCounts = workspace ? countAll(workspace.objects) : 0;
  const buildPrompt = workspace
    ? createBuildPrompt(workspace, {
      targetTool: promptTarget,
      ...(selectedBuildStep ? { buildStepTempId: selectedBuildStep } : {}),
    })
    : "";
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
          <select value={aiConfig.provider} onChange={(event) => updateAiConfig({ provider: event.target.value as AiProviderName })}>
            <option value="mock">Mock</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
            <option value="openrouter">OpenRouter</option>
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
      <div className="button-row">
        <button type="button" onClick={saveAiSettings}>설정 저장</button>
        <button className="secondary" type="button" onClick={() => setAiConfig(DEFAULT_AI_PROVIDER_CONFIG)}>Mock으로 되돌리기</button>
      </div>
      {aiConfig.lastValidatedAt ? <p className="muted export-file-name">최근 확인: {formatDateTime(aiConfig.lastValidatedAt)}</p> : null}
      {aiSettingsMessage ? <p className="notice info">{aiSettingsMessage}</p> : null}
    </section>
  );

  function createProject() {
    const now = new Date().toISOString();
    const projectId = `project_${crypto.randomUUID()}`;
    const nextWorkspace: ProjectWorkspace = {
      project: {
        id: projectId,
        name: projectName.trim() || "새 앱 아이디어",
        description: "AI가 만들기 전에 구조를 먼저 확인하는 로컬 프로젝트",
        appTypes: [],
        createdAt: now,
        updatedAt: now,
      },
      sourceDocuments: [
        {
          id: `src_${crypto.randomUUID()}`,
          projectId,
          title: "아이디어 / PRD",
          content: sourceText.trim(),
          sourceType,
          version: 1,
          createdAt: now,
        },
      ],
      objects: createEmptySuggestionSet(),
      buildPlanSuggestions: [],
      updatedAt: now,
    };
    setWorkspace(nextWorkspace);
    window.location.hash = projectRoute(projectId, "source");
  }

  function runMockAnalysis() {
    const now = new Date().toISOString();
    const baseWorkspace = workspace ?? createWorkspaceFromForm(now);
    const versionedWorkspace = syncSourceDocument(baseWorkspace, now);
    const sourceDocument = getLatestSourceDocument(versionedWorkspace);
    if (!sourceDocument) return;
    const analysis = mockAiProviderAdapter.analyze({ sourceDocument });
    const validation = validateAiAnalysisResult(analysis);
    if (!validation.ok) {
      setSaveError(`AI 분석 결과 검증 실패: ${validation.errors.join(" / ")}`);
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

    setWorkspace({
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
    });
  }

  function createWorkspaceFromForm(now: string): ProjectWorkspace {
    const projectId = `project_${crypto.randomUUID()}`;
    return {
      project: {
        id: projectId,
        name: projectName.trim() || "새 앱 아이디어",
        description: "AI가 만들기 전에 구조를 먼저 확인하는 로컬 프로젝트",
        appTypes: [],
        createdAt: now,
        updatedAt: now,
      },
      sourceDocuments: [
        {
          id: `src_${crypto.randomUUID()}`,
          projectId,
          title: "아이디어 / PRD",
          content: sourceText.trim(),
          sourceType,
          version: 1,
          createdAt: now,
        },
      ],
      objects: createEmptySuggestionSet(),
      buildPlanSuggestions: [],
      updatedAt: now,
    };
  }

  function updateObjectStatus(bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) {
    replaceObject(bucket, object.id, updateXrayObjectStatus(object, status));
  }

  function editObject(bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) {
    replaceObject(bucket, object.id, editXrayObject(object, patch as never));
  }

  function toggleIssuePrompt(issue: EditableXrayObject) {
    if (!("issueType" in issue)) return;
    replaceObject(
      "issues",
      issue.id,
      editXrayObject(issue, { includeInPrompt: issue.includeInPrompt === false }),
    );
  }

  function replaceObject(bucket: ObjectBucket, id: string, nextObject: XrayObject) {
    setWorkspace((current) => {
      if (!current) return current;
      const collection = current.objects[bucket] as XrayObject[];
      return {
        ...current,
        objects: {
          ...current.objects,
          [bucket]: collection.map((object) => (object.id === id ? nextObject : object)),
        },
        updatedAt: new Date().toISOString(),
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
  }

  function openProject(projectId: string) {
    const result = repository.setActiveProject(projectId);
    setWorkspace(result.workspace);
    setSaveError(result.error ?? null);
  }

  function deleteProject(projectId: string) {
    if (!window.confirm("이 로컬 프로젝트를 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    const result = repository.deleteWorkspace(projectId);
    setWorkspace(result.activeWorkspace);
    setProjectSummaries(summarizeProjects(result.collection));
    if (!result.activeWorkspace) {
      setProjectName("현장 전력설비 관리 앱");
      setSourceText(DEFAULT_PRD);
    }
  }

  function saveSourceVersion() {
    const now = new Date().toISOString();
    setWorkspace((current) => {
      const baseWorkspace = current ?? createWorkspaceFromForm(now);
      return syncSourceDocument(baseWorkspace, now);
    });
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
      return;
    }
    setSourceText(result.content);
    setSourceType(result.sourceType);
    setSourceImportMessage(`${result.fileName} 원문을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.`);
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

  function downloadWorkspaceBackup() {
    if (!workspace) return;
    const fileName = `app-xray-workspace-${workspace.project.name.trim().replace(/[^a-zA-Z0-9가-힣]+/g, "-") || "project"}.json`;
    downloadTextFile(fileName, serializeWorkspaceBackup(workspace));
  }

  async function importWorkspaceFile(file: File | undefined) {
    if (!file) return;
    const raw = await file.text();
    const result = importWorkspaceBackup(raw, workspace);
    if (!result.ok) {
      setBackupMessage(result.error);
      return;
    }
    setWorkspace(result.workspace);
    setBackupMessage(
      result.validation.isExportSafe
        ? "workspace 백업을 불러왔습니다."
        : `workspace를 불러왔지만 내보내기 전에 고칠 것 ${result.validation.errors.length}개가 있습니다.`,
    );
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
              <button type="button" onClick={() => { openProject(project.id); window.location.hash = projectRoute(project.id, "source"); }}>{project.name}</button>
              <button className="secondary icon-button" type="button" aria-label={`${project.name} 삭제`} onClick={() => deleteProject(project.id)}>
                ×
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
            <button type="button" onClick={runMockAnalysis}>{workspace ? "Mock 재분석" : "Mock 분석하기"}</button>
          </div>
        </header>

        {saveError ? <p className="notice error">로컬 저장 실패: {saveError}</p> : null}

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
                <option value="pdf">PDF 지원 예정</option>
              </select>
            </label>
            <label>
              아이디어 / PRD
              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={7} />
            </label>
            <label>
              Markdown/TXT 파일 가져오기
              <input accept=".md,.markdown,.txt,.pdf" type="file" onChange={(event) => void importSourceFile(event.target.files?.[0])} />
            </label>
          </div>
          {sourceImportMessage ? <p className="notice info">{sourceImportMessage}</p> : null}
          <div className="button-row">
            <button type="button" onClick={createProject}>프로젝트 저장</button>
            {workspace ? <button className="secondary" type="button" onClick={saveSourceVersion}>원문 새 버전 저장</button> : null}
            <button className="secondary" type="button" onClick={runMockAnalysis}>저장하고 Mock 분석</button>
          </div>
          <div className="source-meta">
            <span>현재 원문 버전: v{latestSourceDocument?.version ?? 0}</span>
            {latestSourceDocument ? <span>저장 시각: {formatDateTime(latestSourceDocument.createdAt)}</span> : null}
            {workspace?.lastAnalysis ? (
              <>
                <span>최근 분석: v{workspace.lastAnalysis.sourceVersion}</span>
                <span>새 제안 {workspace.lastAnalysis.addedSuggestedCount}</span>
                <span>갱신 제안 {workspace.lastAnalysis.refreshedSuggestedCount}</span>
                <span>보존 확정 {workspace.lastAnalysis.preservedConfirmedCount}</span>
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
              objects={workspace.objects}
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

            <ExportPanel activeExport={activeExport} onExportChange={setActiveExport} workspace={workspace} />

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
            </section>

            {aiSettingsPanel}
          </>
        ) : route.name === "aiSettings" ? (
          aiSettingsPanel
        ) : (
          <section className="empty-state">
            <h2>아직 저장된 구조가 없습니다.</h2>
            <p>아이디어를 저장하고 Mock 분석을 실행하면 화면, 정보 구조, 빠진 것이 suggested 상태로 나타납니다.</p>
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
