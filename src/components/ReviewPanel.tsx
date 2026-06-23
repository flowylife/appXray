import { useState } from "react";
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
import type { AnalysisChange } from "../domain/workspace.js";

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: "검토 대기",
  accepted: "확정",
  edited: "수정 확정",
  rejected: "제외",
  deferred: "나중에 결정",
};

export type ObjectBucket = keyof XraySuggestionSet;
export type ReviewFilter = "all" | SuggestionStatus;
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
  onStatus,
  onEdit,
}: {
  objects: XraySuggestionSet;
  analysisChanges?: AnalysisChange[] | undefined;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const allObjects = Object.values(objects).flat() as XrayObject[];
  const counts = countByStatus(allObjects);
  const changeByObjectId = new Map(analysisChanges.map((change) => [change.objectId, change]));

  return (
    <section className="panel" id="review">
      <div className="section-heading">
        <span>분석 검토</span>
        <h2>AI 제안 초안</h2>
      </div>
      <div className="review-filters" aria-label="Review status filters">
        {REVIEW_FILTERS.map((nextFilter) => (
          <button
            className={filter === nextFilter ? "active" : "secondary"}
            key={nextFilter}
            type="button"
            onClick={() => setFilter(nextFilter)}
          >
            {filterLabel(nextFilter)} {counts[nextFilter] ?? 0}
          </button>
        ))}
      </div>
      {(Object.keys(BUCKET_LABELS) as ObjectBucket[]).map((bucket) => (
        <ReviewGroup
          bucket={bucket}
          changes={changeByObjectId}
          filter={filter}
          key={bucket}
          objects={objects[bucket] as XrayObject[]}
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
  filter,
  changes,
  onStatus,
  onEdit,
}: {
  title: string;
  bucket: ObjectBucket;
  filter: ReviewFilter;
  objects: XrayObject[];
  changes: Map<string, AnalysisChange>;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const filteredObjects = filterObjects(objects, filter);

  return (
    <div className="review-group">
      <h3>{title} <span>{filteredObjects.length} / {objects.length}</span></h3>
      <div className="review-list">
        {objects.length === 0 ? <p className="muted">아직 제안이 없습니다.</p> : null}
        {objects.length > 0 && filteredObjects.length === 0 ? <p className="muted">현재 필터에 맞는 제안이 없습니다.</p> : null}
        {filteredObjects.map((object) => (
          <ReviewRow
            bucket={bucket}
            change={changes.get(object.id)}
            key={object.id}
            object={object}
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
  onStatus,
  onEdit,
}: {
  bucket: ObjectBucket;
  object: XrayObject;
  change?: AnalysisChange | undefined;
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
      <article className="review-row editing">
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
        <div className="row-actions">
          <button type="button" onClick={saveEdit}>저장</button>
          <button className="secondary" type="button" onClick={() => setIsEditing(false)}>취소</button>
        </div>
      </article>
    );
  }

  return (
    <article className="review-row">
      <div>
        <strong>{getObjectLabel(object)}</strong>
        <p>{getObjectDescription(object)}</p>
        {object.sourceTrace?.quote ? <small className="row-note">원문 근거: {object.sourceTrace.quote}</small> : <small className="row-note">원문 근거 없음</small>}
        {"resolutionNote" in object && object.resolutionNote ? <small className="row-note">결정 메모: {object.resolutionNote}</small> : null}
      </div>
      <div className="badge-stack">
        {change ? <AnalysisChangeBadge change={change} /> : null}
        <StatusBadge status={object.status} />
      </div>
      <div className="row-actions">
        <button type="button" onClick={() => onStatus(bucket, object, "accepted")}>확정</button>
        <button type="button" onClick={startEdit}>수정</button>
        <button className="secondary" type="button" onClick={() => onStatus(bucket, object, "deferred")}>나중</button>
        <button className="danger" type="button" onClick={() => onStatus(bucket, object, "rejected")}>제외</button>
      </div>
    </article>
  );
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
  };

  return <span className={`change-badge ${change.changeType}`}>{labelByType[change.changeType]}</span>;
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

function filterObjects<T extends XrayObject>(objects: T[], filter: ReviewFilter): T[] {
  if (filter === "all") return objects;
  return objects.filter((object) => object.status === filter);
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

function filterLabel(filter: ReviewFilter): string {
  if (filter === "all") return "전체";
  return STATUS_LABELS[filter];
}

type EditDraft = Record<string, string | boolean>;
