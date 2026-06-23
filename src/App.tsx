import { useEffect, useMemo, useState } from "react";
import { convertAiAnalysisToXrayObjects } from "./domain/convert.js";
import { editXrayObject, mergeAiSuggestionsPreservingConfirmed, updateXrayObjectStatus } from "./domain/lifecycle.js";
import { isConfirmedXrayObject } from "./domain/status.js";
import type { BaseXrayObject, DataObject, Issue, Screen, SuggestionStatus, XrayObject, XraySuggestionSet } from "./domain/types.js";
import type { ProjectWorkspace } from "./domain/workspace.js";
import { createEmptySuggestionSet } from "./domain/workspace.js";
import { exportProjectJson } from "./export/json.js";
import { exportProjectMarkdown } from "./export/markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "./export/mermaid.js";
import { fieldPowerAppSourceDocument, mockFieldPowerAppAnalysis } from "./fixtures/field-power-app.js";
import { createBuildPrompt } from "./prompt/build-prompt.js";
import { createLocalStorageProjectRepository } from "./storage/project-repository.js";

const DEFAULT_PRD = fieldPowerAppSourceDocument.content;
const STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: "검토 대기",
  accepted: "확정",
  edited: "수정 확정",
  rejected: "제외",
  deferred: "나중에 결정",
};

type ObjectBucket = keyof XraySuggestionSet;

export default function App() {
  const repository = useMemo(() => createLocalStorageProjectRepository(), []);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(() => repository.load());
  const [projectName, setProjectName] = useState(workspace?.project.name ?? "현장 전력설비 관리 앱");
  const [sourceText, setSourceText] = useState(workspace?.sourceDocuments.at(0)?.content ?? DEFAULT_PRD);
  const [activeExport, setActiveExport] = useState<"markdown" | "appMermaid" | "dataMermaid" | "json">("markdown");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) return;
    try {
      repository.save(workspace);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장할 수 없습니다.");
    }
  }, [repository, workspace]);

  const confirmedCounts = workspace ? countConfirmed(workspace.objects) : 0;
  const totalCounts = workspace ? countAll(workspace.objects) : 0;
  const exportPreview = workspace ? createExportPreview(workspace, activeExport) : "";
  const buildPrompt = workspace ? createBuildPrompt(workspace, { targetTool: "codex" }) : "";

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
    const sourceDocument = baseWorkspace.sourceDocuments.at(0);
    if (!sourceDocument) return;

    const converted = convertAiAnalysisToXrayObjects({
      project: baseWorkspace.project,
      sourceDocument,
      analysis: mockFieldPowerAppAnalysis,
      now,
    });

    setWorkspace({
      ...baseWorkspace,
      project: {
        ...baseWorkspace.project,
        appTypes: mockFieldPowerAppAnalysis.summary.appTypes,
        updatedAt: now,
      },
      objects: mergeAiSuggestionsPreservingConfirmed(baseWorkspace.objects, converted),
      buildPlanSuggestions: converted.buildPlanSuggestions,
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

  function editObject(bucket: ObjectBucket, object: XrayObject) {
    const currentLabel = getObjectLabel(object);
    const nextLabel = window.prompt("사용자가 확정할 이름을 입력하세요.", currentLabel);
    if (!nextLabel) return;

    if ("displayName" in object) {
      replaceObject(bucket, object.id, editXrayObject(object, { displayName: nextLabel } as never));
      return;
    }
    if ("title" in object) {
      replaceObject(bucket, object.id, editXrayObject(object, { title: nextLabel } as never));
    }
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
    repository.clear();
    setWorkspace(null);
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
            <button className="secondary" type="button" onClick={resetWorkspace}>초기화</button>
            <button type="button" onClick={runMockAnalysis}>Mock 분석하기</button>
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
            <button className="secondary" type="button" onClick={runMockAnalysis}>저장하고 Mock 분석</button>
          </div>
        </section>

        {workspace ? (
          <>
            <section className="panel" id="review">
              <div className="section-heading">
                <span>분석 검토</span>
                <h2>AI 제안 초안</h2>
              </div>
              <ReviewGroup title="화면" bucket="screens" objects={workspace.objects.screens} onStatus={updateObjectStatus} onEdit={editObject} />
              <ReviewGroup title="앱이 저장할 정보" bucket="dataObjects" objects={workspace.objects.dataObjects} onStatus={updateObjectStatus} onEdit={editObject} />
              <ReviewGroup title="빠진 것" bucket="issues" objects={workspace.objects.issues} onStatus={updateObjectStatus} onEdit={editObject} />
            </section>

            <section className="map-grid">
              <div className="panel" id="app-map">
                <div className="section-heading">
                  <span>앱 지도</span>
                  <h2>화면과 기능</h2>
                </div>
                <AppMap screens={workspace.objects.screens} />
              </div>
              <div className="panel" id="data-map">
                <div className="section-heading">
                  <span>정보 구조</span>
                  <h2>앱이 저장할 정보</h2>
                </div>
                <DataMap objects={workspace.objects.dataObjects} />
              </div>
            </section>

            <section className="panel" id="missing">
              <div className="section-heading">
                <span>빠진 것</span>
                <h2>결정 필요 항목</h2>
              </div>
              <MissingParts issues={workspace.objects.issues} />
            </section>

            <section className="panel" id="prompt">
              <div className="section-heading">
                <span>빌드 프롬프트</span>
                <h2>Codex용 미리보기</h2>
              </div>
              <pre className="preview">{buildPrompt}</pre>
            </section>

            <section className="panel" id="export">
              <div className="section-heading">
                <span>내보내기</span>
                <h2>확정 데이터 기반 export</h2>
              </div>
              <div className="segmented" role="tablist" aria-label="Export type">
                <button className={activeExport === "markdown" ? "active" : ""} onClick={() => setActiveExport("markdown")}>Markdown</button>
                <button className={activeExport === "appMermaid" ? "active" : ""} onClick={() => setActiveExport("appMermaid")}>App Mermaid</button>
                <button className={activeExport === "dataMermaid" ? "active" : ""} onClick={() => setActiveExport("dataMermaid")}>Data Mermaid</button>
                <button className={activeExport === "json" ? "active" : ""} onClick={() => setActiveExport("json")}>JSON</button>
              </div>
              <pre className="preview">{exportPreview}</pre>
            </section>
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

function ReviewGroup({
  title,
  bucket,
  objects,
  onStatus,
  onEdit,
}: {
  title: string;
  bucket: ObjectBucket;
  objects: XrayObject[];
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: XrayObject) => void;
}) {
  return (
    <div className="review-group">
      <h3>{title}</h3>
      <div className="review-list">
        {objects.length === 0 ? <p className="muted">아직 제안이 없습니다.</p> : null}
        {objects.map((object) => (
          <article className="review-row" key={object.id}>
            <div>
              <strong>{getObjectLabel(object)}</strong>
              <p>{getObjectDescription(object)}</p>
            </div>
            <StatusBadge status={object.status} />
            <div className="row-actions">
              <button onClick={() => onStatus(bucket, object, "accepted")}>확정</button>
              <button onClick={() => onEdit(bucket, object)}>수정</button>
              <button className="secondary" onClick={() => onStatus(bucket, object, "deferred")}>나중</button>
              <button className="danger" onClick={() => onStatus(bucket, object, "rejected")}>제외</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AppMap({ screens }: { screens: Screen[] }) {
  return (
    <div className="node-list">
      {screens.map((screen) => (
        <div className={`node ${isConfirmedXrayObject(screen) ? "confirmed" : ""}`} key={screen.id}>
          <span>{screen.screenType}</span>
          <strong>{screen.displayName ?? screen.name}</strong>
          <StatusBadge status={screen.status} />
        </div>
      ))}
    </div>
  );
}

function DataMap({ objects }: { objects: DataObject[] }) {
  return (
    <div className="node-list">
      {objects.map((object) => (
        <div className={`node ${isConfirmedXrayObject(object) ? "confirmed" : ""}`} key={object.id}>
          <span>{object.objectType}</span>
          <strong>{object.displayName ?? object.name}</strong>
          <StatusBadge status={object.status} />
        </div>
      ))}
    </div>
  );
}

function MissingParts({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return <p className="muted">아직 빠진 것이 없습니다.</p>;

  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <article className="issue" key={issue.id}>
          <span>{issue.severity}</span>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.description}</p>
          </div>
          <StatusBadge status={issue.status} />
        </article>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: SuggestionStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
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

function createExportPreview(workspace: ProjectWorkspace, type: "markdown" | "appMermaid" | "dataMermaid" | "json"): string {
  if (type === "markdown") return exportProjectMarkdown(workspace);
  if (type === "appMermaid") return exportAppMapMermaid(workspace);
  if (type === "dataMermaid") return exportDataMapMermaid(workspace);
  return exportProjectJson(workspace);
}

function getObjectLabel(object: XrayObject): string {
  if ("displayName" in object && object.displayName) return object.displayName;
  if ("title" in object) return object.title;
  if ("name" in object) return object.name;
  if ("text" in object) return object.text;
  return object.id;
}

function getObjectDescription(object: XrayObject): string {
  if ("description" in object && object.description) return object.description;
  if ("text" in object) return object.text;
  if ("actionDescription" in object) return object.actionDescription;
  return "설명이 없습니다.";
}
