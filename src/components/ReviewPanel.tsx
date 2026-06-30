import { useEffect, useState } from "react";
import type { StructureDiffReport } from "../domain/diff.js";
import type {
  ActionType,
  DataFieldType,
  IssueType,
  PermissionAction,
  PermissionTargetType,
  RelationType,
  RequirementType,
  ScreenType,
  SuggestionStatus,
  XrayObject,
  XraySuggestionSet,
} from "../domain/types.js";
import type { AnalysisChange, WorkspaceAnalysisSummary } from "../domain/workspace.js";
import type { ValidationIssue } from "../domain/validation.js";
import { getValidationIssueTarget, getValidationTargetElementId } from "../domain/validation-actions.js";

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: "검토 대기",
  accepted: "확정",
  edited: "수정 확정",
  rejected: "제외",
  deferred: "나중에 결정",
};

export type ObjectBucket = keyof XraySuggestionSet;
export type ReviewFilter = "all" | SuggestionStatus;
type BucketFilter = "all" | ObjectBucket;
export type EditableXrayObject = XrayObject;

type FieldKind = "text" | "textarea" | "number" | "checkbox" | "select";

type EditField = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
};

const REVIEW_FILTERS: ReviewFilter[] = ["all", "suggested", "accepted", "edited", "rejected", "deferred"];

const BUCKET_LABELS: Record<ObjectBucket, string> = {
  requirements: "요구사항",
  screens: "화면",
  features: "기능",
  dataObjects: "앱이 저장할 정보",
  dataFields: "저장할 정보의 항목",
  dataRelations: "정보 연결",
  roles: "사용자 역할",
  permissions: "누가 무엇을 할 수 있는지",
  flows: "사용 흐름",
  flowSteps: "사용 흐름 단계",
  issues: "빠진 것",
};

const REQUIREMENT_TYPES: RequirementType[] = [
  "screen",
  "feature",
  "data",
  "permission",
  "flow",
  "non_functional",
  "business_rule",
  "unknown",
];
const SCREEN_TYPES: ScreenType[] = ["dashboard", "list", "detail", "form", "settings", "admin", "report", "canvas", "modal", "unknown"];
const ACTION_TYPES: ActionType[] = ["create", "read", "update", "delete", "search", "filter", "import", "export", "notify", "approve", "visualize", "unknown"];
const DATA_FIELD_TYPES: DataFieldType[] = ["text", "number", "boolean", "date", "datetime", "enum", "relation", "file", "json", "unknown"];
const RELATION_TYPES: RelationType[] = ["one_to_one", "one_to_many", "many_to_one", "many_to_many", "contains", "references", "owns", "creates", "unknown"];
const PERMISSION_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete", "export", "approve", "manage"];
const PERMISSION_TARGET_TYPES: PermissionTargetType[] = ["screen", "feature", "dataObject", "project"];
const ISSUE_TYPES: IssueType[] = ["missing", "ambiguous", "conflict", "data_gap", "permission_gap", "state_gap", "exception_gap", "scope_risk"];
const PRIORITIES = ["low", "medium", "high"] as const;
const SEVERITIES = ["low", "medium", "high"] as const;

const EDIT_FIELDS: Record<ObjectBucket, EditField[]> = {
  requirements: [
    { key: "text", label: "요구 내용", kind: "textarea" },
    { key: "requirementType", label: "종류", kind: "select", options: REQUIREMENT_TYPES },
    { key: "priority", label: "중요도", kind: "select", options: PRIORITIES },
  ],
  screens: [
    { key: "displayName", label: "쉬운 이름", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
    { key: "screenType", label: "화면 종류", kind: "select", options: SCREEN_TYPES },
    { key: "parentScreenId", label: "상위 화면 ID", kind: "text" },
  ],
  features: [
    { key: "name", label: "기능 이름", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
    { key: "actionType", label: "동작 종류", kind: "select", options: ACTION_TYPES },
    { key: "screenId", label: "연결 화면 ID", kind: "text" },
  ],
  dataObjects: [
    { key: "displayName", label: "쉬운 이름", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
  ],
  dataFields: [
    { key: "name", label: "항목 이름", kind: "text" },
    { key: "displayName", label: "쉬운 이름", kind: "text" },
    { key: "fieldType", label: "값 종류", kind: "select", options: DATA_FIELD_TYPES },
    { key: "required", label: "필수 항목", kind: "checkbox" },
    { key: "enumValues", label: "선택값", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
  ],
  dataRelations: [
    { key: "sourceObjectId", label: "시작 정보 ID", kind: "text" },
    { key: "targetObjectId", label: "연결 정보 ID", kind: "text" },
    { key: "relationType", label: "연결 종류", kind: "select", options: RELATION_TYPES },
    { key: "description", label: "설명", kind: "textarea" },
  ],
  roles: [
    { key: "name", label: "역할 이름", kind: "text" },
    { key: "displayName", label: "쉬운 이름", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
  ],
  permissions: [
    { key: "roleId", label: "역할 ID", kind: "text" },
    { key: "targetType", label: "대상 종류", kind: "select", options: PERMISSION_TARGET_TYPES },
    { key: "targetId", label: "대상 ID", kind: "text" },
    { key: "action", label: "허용 동작", kind: "select", options: PERMISSION_ACTIONS },
    { key: "allowed", label: "허용", kind: "checkbox" },
  ],
  flows: [
    { key: "name", label: "흐름 이름", kind: "text" },
    { key: "description", label: "설명", kind: "textarea" },
    { key: "primaryRoleId", label: "주요 역할 ID", kind: "text" },
  ],
  flowSteps: [
    { key: "stepOrder", label: "순서", kind: "number" },
    { key: "screenId", label: "화면 ID", kind: "text" },
    { key: "actionDescription", label: "사용자 행동", kind: "textarea" },
    { key: "dataObjectId", label: "사용 정보 ID", kind: "text" },
    { key: "featureId", label: "기능 ID", kind: "text" },
  ],
  issues: [
    { key: "title", label: "제목", kind: "text" },
    { key: "issueType", label: "종류", kind: "select", options: ISSUE_TYPES },
    { key: "severity", label: "중요도", kind: "select", options: SEVERITIES },
    { key: "description", label: "설명", kind: "textarea" },
    { key: "suggestion", label: "제안", kind: "textarea" },
    { key: "resolutionNote", label: "결정 메모", kind: "textarea" },
    { key: "includeInPrompt", label: "빌드 프롬프트에 포함", kind: "checkbox" },
  ],
};

export function ReviewPanel({
  objects,
  analysisChanges = [],
  analysisSummary,
  structureDiff,
  validationIssues = [],
  focusedValidationIssue,
  canUndoStatus,
  onStatus,
  onBulkStatus,
  onEdit,
  onUndoStatus,
}: {
  objects: XraySuggestionSet;
  analysisChanges?: AnalysisChange[] | undefined;
  analysisSummary?: WorkspaceAnalysisSummary | undefined;
  structureDiff?: StructureDiffReport | undefined;
  validationIssues?: ValidationIssue[] | undefined;
  focusedValidationIssue?: ValidationIssue | null | undefined;
  canUndoStatus: boolean;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onBulkStatus: (bucket: ObjectBucket, objects: XrayObject[], status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
  onUndoStatus: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ReviewFilter>("all");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const changeByObjectId = new Map(analysisChanges.map((change) => [change.objectId, change]));
  const validationIssuesByObject = groupValidationIssuesByObject(validationIssues);
  const focusedValidationTarget = focusedValidationIssue ? getValidationIssueTarget(focusedValidationIssue) : null;
  const visibleBuckets = (Object.keys(BUCKET_LABELS) as ObjectBucket[]).filter(
    (bucket) => bucketFilter === "all" || bucket === bucketFilter,
  );

  useEffect(() => {
    if (!focusedValidationTarget) return;
    setBucketFilter(focusedValidationTarget.bucket);
    setStatusFilter("all");
    setSearchTerm("");
  }, [focusedValidationTarget?.bucket, focusedValidationTarget?.id]);

  return (
    <section className="panel" id="review">
      <div className="section-heading">
        <span>분석 검토</span>
        <h2>AI 제안 초안</h2>
      </div>
      <MergeImpactPanel analysisSummary={analysisSummary} structureDiff={structureDiff} />
      <div className="review-toolbar">
        <label>
          제안 종류 필터
          <select value={bucketFilter} onChange={(event) => setBucketFilter(event.target.value as BucketFilter)}>
            <option value="all">전체</option>
            {(Object.keys(BUCKET_LABELS) as ObjectBucket[]).map((bucket) => (
              <option key={bucket} value={bucket}>{BUCKET_LABELS[bucket]}</option>
            ))}
          </select>
        </label>
        <label>
          제안 검색
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="이름이나 설명 검색"
          />
        </label>
        <button
          className="secondary"
          type="button"
          aria-label="최근 판정 되돌리기"
          disabled={!canUndoStatus}
          onClick={onUndoStatus}
        >
          최근 판정 되돌리기
        </button>
      </div>
      <div className="review-filters" aria-label="Review status filters">
        {REVIEW_FILTERS.map((nextFilter) => (
          <button
            className={statusFilter === nextFilter ? "active" : "secondary"}
            key={nextFilter}
            type="button"
            onClick={() => setStatusFilter(nextFilter)}
          >
            {filterLabel(nextFilter)}
          </button>
        ))}
      </div>
      {visibleBuckets.map((bucket) => (
        <ReviewGroup
          bucket={bucket}
          changes={changeByObjectId}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          validationIssuesByObject={validationIssuesByObject}
          key={bucket}
          objects={objects[bucket] as XrayObject[]}
          onBulkStatus={onBulkStatus}
          onEdit={onEdit}
          onStatus={onStatus}
          title={BUCKET_LABELS[bucket]}
        />
      ))}
    </section>
  );
}

function ReviewGroup({
  title,
  bucket,
  objects,
  statusFilter,
  searchTerm,
  changes,
  validationIssuesByObject,
  onStatus,
  onBulkStatus,
  onEdit,
}: {
  title: string;
  bucket: ObjectBucket;
  statusFilter: ReviewFilter;
  searchTerm: string;
  objects: XrayObject[];
  changes: Map<string, AnalysisChange>;
  validationIssuesByObject: Map<string, ValidationIssue[]>;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onBulkStatus: (bucket: ObjectBucket, objects: XrayObject[], status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const filteredObjects = filterObjects(objects, statusFilter, searchTerm);
  const counts = countByStatus(objects);

  return (
    <div className="review-group" aria-label={`리뷰 그룹: ${title}`}>
      <div className="review-group-heading">
        <div>
          <h3>{title} <span>{filteredObjects.length} / {objects.length}</span></h3>
          <StatusCounts counts={counts} />
        </div>
        <div className="row-actions">
          <button
            type="button"
            disabled={filteredObjects.length === 0}
            aria-label={`${title} 표시 항목 모두 확정`}
            onClick={() => onBulkStatus(bucket, filteredObjects, "accepted")}
          >
            {title} 표시 항목 모두 확정
          </button>
          <button
            className="danger"
            type="button"
            disabled={filteredObjects.length === 0}
            aria-label={`${title} 표시 항목 모두 제외`}
            onClick={() => onBulkStatus(bucket, filteredObjects, "rejected")}
          >
            {title} 표시 항목 모두 제외
          </button>
        </div>
      </div>
      <div className="review-list">
        {objects.length === 0 ? <p className="muted">아직 제안이 없습니다.</p> : null}
        {objects.length > 0 && filteredObjects.length === 0 ? <p className="muted">현재 필터에 맞는 제안이 없습니다.</p> : null}
        {filteredObjects.map((object) => (
          <ReviewRow
            bucket={bucket}
            change={changes.get(object.id)}
            key={object.id}
            object={object}
            validationIssues={validationIssuesByObject.get(validationIssueMapKey(bucket, object.id)) ?? []}
            onEdit={onEdit}
            onStatus={onStatus}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewRow({
  bucket,
  object,
  change,
  validationIssues,
  onStatus,
  onEdit,
}: {
  bucket: ObjectBucket;
  object: XrayObject;
  change?: AnalysisChange | undefined;
  validationIssues: ValidationIssue[];
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(bucket, object));

  function startEdit() {
    setDraft(createDraft(bucket, object));
    setIsEditing(true);
  }

  function saveEdit() {
    onEdit(bucket, object, createPatch(bucket, object, draft));
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <article
        className="review-row editing"
        id={getValidationTargetElementId(bucket, object.id)}
        aria-label={`리뷰 항목: ${titleForBucket(bucket)} - ${getObjectLabel(object)}`}
      >
        <div className="edit-fields">
          {EDIT_FIELDS[bucket].map((field) => (
            <EditFieldControl
              draft={draft}
              field={field}
              key={field.key}
              onChange={(nextDraft) => setDraft(nextDraft)}
            />
          ))}
        </div>
        <StatusBadge status={object.status} />
        {validationIssues.length > 0 ? <ValidationBadgeStack issues={validationIssues} /> : null}
        <div className="row-actions">
          <button type="button" aria-label={`${getObjectLabel(object)} 저장`} onClick={saveEdit}>저장</button>
          <button className="secondary" type="button" aria-label={`${getObjectLabel(object)} 취소`} onClick={() => setIsEditing(false)}>취소</button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="review-row"
      id={getValidationTargetElementId(bucket, object.id)}
      aria-label={`리뷰 항목: ${titleForBucket(bucket)} - ${getObjectLabel(object)}`}
    >
      <div>
        <strong>{getObjectLabel(object)}</strong>
        <p>{getObjectDescription(object)}</p>
        {object.sourceTrace?.quote ? <small className="row-note">원문 근거: {object.sourceTrace.quote}</small> : <small className="row-note">원문 근거 없음</small>}
        {"resolutionNote" in object && object.resolutionNote ? <small className="row-note">결정 메모: {object.resolutionNote}</small> : null}
      </div>
      <div className="badge-stack">
        {change ? <AnalysisChangeBadge change={change} /> : null}
        {validationIssues.length > 0 ? <ValidationBadgeStack issues={validationIssues} /> : null}
        <StatusBadge status={object.status} />
      </div>
      <div className="row-actions">
        <button type="button" aria-label={`${getObjectLabel(object)} 확정`} onClick={() => onStatus(bucket, object, "accepted")}>확정</button>
        <button type="button" aria-label={`${getObjectLabel(object)} 수정`} onClick={startEdit}>수정</button>
        <button className="secondary" type="button" aria-label={`${getObjectLabel(object)} 나중`} onClick={() => onStatus(bucket, object, "deferred")}>나중</button>
        <button className="danger" type="button" aria-label={`${getObjectLabel(object)} 제외`} onClick={() => onStatus(bucket, object, "rejected")}>제외</button>
      </div>
    </article>
  );
}

function titleForBucket(bucket: ObjectBucket): string {
  return BUCKET_LABELS[bucket];
}

function EditFieldControl({
  draft,
  field,
  onChange,
}: {
  draft: EditDraft;
  field: EditField;
  onChange: (draft: EditDraft) => void;
}) {
  const value = draft[field.key];
  if (field.kind === "checkbox") {
    return (
      <label className="checkbox-label">
        <input
          checked={value === true}
          type="checkbox"
          onChange={(event) => onChange({ ...draft, [field.key]: event.target.checked })}
        />
        {field.label}
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label>
        {field.label}
        <select value={String(value ?? "")} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}>
          <option value="">미정</option>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label>
        {field.label}
        <textarea value={String(value ?? "")} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })} rows={3} />
      </label>
    );
  }
  return (
    <label>
      {field.label}
      <input
        type={field.kind === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
      />
    </label>
  );
}

export function StatusBadge({ status }: { status: SuggestionStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}

export function AnalysisChangeBadge({ change }: { change: AnalysisChange }) {
  const labelByType: Record<AnalysisChange["changeType"], string> = {
    added_suggestion: "새 제안",
    refreshed_suggestion: "갱신됨",
    preserved_confirmed: "확정 보존",
    preserved_review_decision: "판정 보존",
  };

  return <span className={`change-badge ${change.changeType}`}>{labelByType[change.changeType]}</span>;
}

function ValidationBadgeStack({ issues }: { issues: ValidationIssue[] }) {
  return (
    <>
      {issues.map((issue) => (
        <span
          className={`validation-badge ${issue.severity}`}
          key={issue.id}
          title={issue.message}
        >
          {issue.severity === "error" ? "내보내기 차단" : "확인 필요"}
        </span>
      ))}
    </>
  );
}

function MergeImpactPanel({
  analysisSummary,
  structureDiff,
}: {
  analysisSummary?: WorkspaceAnalysisSummary | undefined;
  structureDiff?: StructureDiffReport | undefined;
}) {
  if (!analysisSummary && !structureDiff) return null;

  return (
    <div className="merge-impact-panel" aria-label="재분석 영향">
      <strong>재분석 영향</strong>
      <span>새 제안 {analysisSummary?.addedSuggestedCount ?? structureDiff?.counts.added ?? 0}</span>
      <span>갱신 제안 {analysisSummary?.refreshedSuggestedCount ?? structureDiff?.counts.changed ?? 0}</span>
      <span>보존된 확정 {analysisSummary?.preservedConfirmedCount ?? structureDiff?.counts.preserved_confirmed ?? 0}</span>
      <span>보존된 판정 {analysisSummary?.preservedReviewDecisionCount ?? 0}</span>
      <span>상태 변경 {structureDiff?.counts.status_changed ?? 0}</span>
    </div>
  );
}

function StatusCounts({ counts }: { counts: Record<ReviewFilter, number> }) {
  return (
    <div className="bucket-status-counts" aria-label="상태별 제안 수">
      <span>검토 대기 {counts.suggested}</span>
      <span>확정 {counts.accepted}</span>
      <span>수정 확정 {counts.edited}</span>
      <span>나중에 결정 {counts.deferred}</span>
      <span>제외 {counts.rejected}</span>
    </div>
  );
}

export function getObjectLabel(object: XrayObject): string {
  if ("displayName" in object && object.displayName) return object.displayName;
  if ("title" in object) return object.title;
  if ("name" in object) return object.name;
  if ("text" in object) return object.text;
  if ("actionDescription" in object) return object.actionDescription;
  return object.id;
}

function getObjectDescription(object: XrayObject): string {
  if ("description" in object && object.description) return object.description;
  if ("text" in object) return object.text;
  if ("actionDescription" in object) return object.actionDescription;
  if ("fieldType" in object) return `${object.name}: ${object.fieldType}`;
  if ("relationType" in object) return `${object.sourceObjectId} → ${object.targetObjectId}`;
  if ("action" in object) return `${object.allowed ? "허용" : "차단"} ${object.action}`;
  return "설명이 없습니다.";
}

function createDraft(bucket: ObjectBucket, object: XrayObject): EditDraft {
  return EDIT_FIELDS[bucket].reduce<EditDraft>((draft, field) => ({
    ...draft,
    [field.key]: field.key === "includeInPrompt" ? getObjectValue(object, field.key) !== false : normalizeValue(getObjectValue(object, field.key)),
  }), {});
}

function createPatch(bucket: ObjectBucket, object: XrayObject, draft: EditDraft): Partial<EditableXrayObject> {
  return EDIT_FIELDS[bucket].reduce<Record<string, unknown>>((patch, field) => {
    const current = getObjectValue(object, field.key);
    const value = draft[field.key];
    if (field.kind === "checkbox") return { ...patch, [field.key]: value === true };
    if (field.kind === "number") return { ...patch, [field.key]: Number(value) || current };
    if (field.key === "enumValues") {
      return {
        ...patch,
        [field.key]: String(value ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    }
    const nextValue = String(value ?? "").trim();
    return {
      ...patch,
      [field.key]: nextValue || undefined,
    };
  }, {}) as Partial<EditableXrayObject>;
}

function getObjectValue(object: XrayObject, key: string): unknown {
  return (object as unknown as Record<string, unknown>)[key];
}

function normalizeValue(value: unknown): string | boolean {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return "";
  return String(value);
}

function filterObjects<T extends XrayObject>(objects: T[], filter: ReviewFilter, searchTerm: string): T[] {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("ko-KR");
  return objects.filter((object) => {
    const matchesStatus = filter === "all" || object.status === filter;
    const matchesSearch = !normalizedSearch || searchableObjectText(object).includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });
}

function countByStatus(objects: XrayObject[]): Record<ReviewFilter, number> {
  return objects.reduce<Record<ReviewFilter, number>>(
    (counts, object) => ({
      ...counts,
      all: counts.all + 1,
      [object.status]: counts[object.status] + 1,
    }),
    {
      all: 0,
      suggested: 0,
      accepted: 0,
      edited: 0,
      rejected: 0,
      deferred: 0,
    },
  );
}

function groupValidationIssuesByObject(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const target = getValidationIssueTarget(issue);
    if (!target) continue;
    const key = validationIssueMapKey(target.bucket, target.id);
    grouped.set(key, [...(grouped.get(key) ?? []), issue]);
  }
  return grouped;
}

function validationIssueMapKey(bucket: ObjectBucket, objectId: string): string {
  return `${bucket}:${objectId}`;
}

function filterLabel(filter: ReviewFilter): string {
  if (filter === "all") return "전체";
  return STATUS_LABELS[filter];
}

type EditDraft = Record<string, string | boolean>;

function searchableObjectText(object: XrayObject): string {
  return [
    object.id,
    getObjectLabel(object),
    getObjectDescription(object),
    object.sourceTrace?.quote ?? "",
    "resolutionNote" in object ? object.resolutionNote ?? "" : "",
  ].join(" ").toLocaleLowerCase("ko-KR");
}
