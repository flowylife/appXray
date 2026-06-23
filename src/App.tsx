import { useEffect, useMemo, useState } from "react";
import { mockAiProviderAdapter, validateAiAnalysisResult } from "./ai/adapter.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { MapPanels, MissingParts } from "./components/MapPanels.js";
import { type EditableXrayObject, type ObjectBucket, ReviewPanel } from "./components/ReviewPanel.js";
import { convertAiAnalysisToXrayObjects } from "./domain/convert.js";
import {
  editXrayObject,
  mergeAiSuggestionsPreservingConfirmed,
  summarizeSuggestionMergeImpact,
  updateXrayObjectStatus,
} from "./domain/lifecycle.js";
import { appendSourceDocumentVersion, getLatestSourceDocument } from "./domain/source-documents.js";
import { isConfirmedXrayObject } from "./domain/status.js";
import type { BaseXrayObject, SuggestionStatus, XrayObject, XraySuggestionSet } from "./domain/types.js";
import type { ProjectWorkspace } from "./domain/workspace.js";
import { createEmptySuggestionSet } from "./domain/workspace.js";
import type { ExportType } from "./export/export-content.js";
import { fieldPowerAppSourceDocument } from "./fixtures/field-power-app.js";
import { createBuildPrompt, type BuildPromptTarget } from "./prompt/build-prompt.js";
import { createLocalStorageProjectRepository, summarizeProjects } from "./storage/project-repository.js";

const DEFAULT_PRD = fieldPowerAppSourceDocument.content;

export default function App() {
  const repository = useMemo(() => createLocalStorageProjectRepository(), []);
  const initialLoad = useMemo(() => repository.loadCollectionWithStatus(), [repository]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(() => initialLoad.activeWorkspace);
  const [projectSummaries, setProjectSummaries] = useState(() => summarizeProjects(initialLoad.collection));
  const [projectName, setProjectName] = useState(workspace?.project.name ?? "현장 전력설비 관리 앱");
  const [sourceText, setSourceText] = useState(workspace?.sourceDocuments.at(0)?.content ?? DEFAULT_PRD);
  const [activeExport, setActiveExport] = useState<ExportType>("markdown");
  const [promptTarget, setPromptTarget] = useState<BuildPromptTarget>("codex");
  const [saveError, setSaveError] = useState<string | null>(initialLoad.error ?? null);

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
    setSourceText(getLatestSourceDocument(workspace)?.content ?? DEFAULT_PRD);
  }, [workspace?.project.id]);

  const confirmedCounts = workspace ? countConfirmed(workspace.objects) : 0;
  const totalCounts = workspace ? countAll(workspace.objects) : 0;
  const buildPrompt = workspace ? createBuildPrompt(workspace, { targetTool: promptTarget }) : "";
  const latestSourceDocument = workspace ? getLatestSourceDocument(workspace) : undefined;

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
          sourceType: "text",
          version: 1,
          createdAt: now,
        },
      ],
      objects: createEmptySuggestionSet(),
      buildPlanSuggestions: [],
      updatedAt: now,
    };
    setWorkspace(nextWorkspace);
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
      objects: mergeAiSuggestionsPreservingConfirmed(versionedWorkspace.objects, converted),
      buildPlanSuggestions: converted.buildPlanSuggestions,
      lastAnalysis,
      analysisHistory: [lastAnalysis, ...(versionedWorkspace.analysisHistory ?? [])].slice(0, 10),
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
          sourceType: "text",
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
    });
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
          <a href="#new-project">새 프로젝트</a>
          <a href="#review">분석 검토</a>
          <a href="#app-map">앱 지도</a>
          <a href="#data-map">정보 구조</a>
          <a href="#missing">빠진 것</a>
          <a href="#prompt">빌드 프롬프트</a>
          <a href="#export">내보내기</a>
        </nav>
        <div className="project-switcher" aria-label="로컬 프로젝트 목록">
          <strong>로컬 프로젝트</strong>
          {projectSummaries.length === 0 ? <small>아직 저장된 프로젝트가 없습니다.</small> : null}
          {projectSummaries.map((project) => (
            <div className={`project-item ${workspace?.project.id === project.id ? "active" : ""}`} key={project.id}>
              <button type="button" onClick={() => openProject(project.id)}>{project.name}</button>
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
              아이디어 / PRD
              <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={7} />
            </label>
          </div>
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

            <section className="panel" id="prompt">
              <div className="section-heading">
                <span>빌드 프롬프트</span>
                <h2>{promptTarget === "codex" ? "Codex" : "Cursor"}용 미리보기</h2>
              </div>
              <div className="segmented prompt-target" aria-label="Prompt target">
                <button className={promptTarget === "codex" ? "active" : ""} type="button" onClick={() => setPromptTarget("codex")}>Codex</button>
                <button className={promptTarget === "cursor" ? "active" : ""} type="button" onClick={() => setPromptTarget("cursor")}>Cursor</button>
              </div>
              <pre className="preview">{buildPrompt}</pre>
            </section>

            <ExportPanel activeExport={activeExport} onExportChange={setActiveExport} workspace={workspace} />
          </>
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
