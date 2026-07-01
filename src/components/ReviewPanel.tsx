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
import {
  getBucketLabel,
  getEditFieldLabel,
  getStatusLabel,
  searchLocale,
  type AppLanguage,
  type Translator,
} from "../i18n.js";

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
  language,
  t,
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
  language: AppLanguage;
  t: Translator;
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
        <span>{t("review.section")}</span>
        <h2>{t("review.title")}</h2>
      </div>
      <MergeImpactPanel analysisSummary={analysisSummary} structureDiff={structureDiff} t={t} />
      <div className="review-toolbar">
        <label>
          {t("review.bucketFilter")}
          <select value={bucketFilter} onChange={(event) => setBucketFilter(event.target.value as BucketFilter)}>
            <option value="all">{filterLabel("all", language)}</option>
            {(Object.keys(BUCKET_LABELS) as ObjectBucket[]).map((bucket) => (
              <option key={bucket} value={bucket}>{getBucketLabel(language, bucket)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("review.search")}
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("review.searchPlaceholder")}
          />
        </label>
        <button
          className="secondary"
          type="button"
          aria-label={t("review.undo")}
          disabled={!canUndoStatus}
          onClick={onUndoStatus}
        >
          {t("review.undo")}
        </button>
      </div>
      <div className="review-filters" aria-label={t("review.filtersAria")}>
        {REVIEW_FILTERS.map((nextFilter) => (
          <button
            className={statusFilter === nextFilter ? "active" : "secondary"}
            key={nextFilter}
            type="button"
            onClick={() => setStatusFilter(nextFilter)}
          >
            {filterLabel(nextFilter, language)}
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
          language={language}
          t={t}
          title={getBucketLabel(language, bucket)}
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
  language,
  t,
}: {
  title: string;
  bucket: ObjectBucket;
  statusFilter: ReviewFilter;
  searchTerm: string;
  objects: XrayObject[];
  changes: Map<string, AnalysisChange>;
  validationIssuesByObject: Map<string, ValidationIssue[]>;
  language: AppLanguage;
  t: Translator;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onBulkStatus: (bucket: ObjectBucket, objects: XrayObject[], status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const filteredObjects = filterObjects(objects, statusFilter, searchTerm, language);
  const counts = countByStatus(objects);

  return (
    <div className="review-group" aria-label={t("review.groupAria", { title })}>
      <div className="review-group-heading">
        <div>
          <h3>{title} <span>{filteredObjects.length} / {objects.length}</span></h3>
          <StatusCounts counts={counts} language={language} t={t} />
        </div>
        <div className="row-actions">
          <button
            type="button"
            disabled={filteredObjects.length === 0}
            aria-label={t("review.acceptVisible", { title })}
            onClick={() => onBulkStatus(bucket, filteredObjects, "accepted")}
          >
            {t("review.acceptVisible", { title })}
          </button>
          <button
            className="danger"
            type="button"
            disabled={filteredObjects.length === 0}
            aria-label={t("review.rejectVisible", { title })}
            onClick={() => onBulkStatus(bucket, filteredObjects, "rejected")}
          >
            {t("review.rejectVisible", { title })}
          </button>
        </div>
      </div>
      <div className="review-list">
        {objects.length === 0 ? <p className="muted">{t("review.empty")}</p> : null}
        {objects.length > 0 && filteredObjects.length === 0 ? <p className="muted">{t("review.noFilterResults")}</p> : null}
        {filteredObjects.map((object) => (
          <ReviewRow
            bucket={bucket}
            change={changes.get(object.id)}
            key={object.id}
            object={object}
            validationIssues={validationIssuesByObject.get(validationIssueMapKey(bucket, object.id)) ?? []}
            onEdit={onEdit}
            onStatus={onStatus}
            language={language}
            t={t}
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
  language,
  t,
}: {
  bucket: ObjectBucket;
  object: XrayObject;
  change?: AnalysisChange | undefined;
  validationIssues: ValidationIssue[];
  language: AppLanguage;
  t: Translator;
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
        aria-label={t("review.itemAria", { bucket: titleForBucket(bucket, language), name: getObjectLabel(object) })}
      >
        <div className="edit-fields">
          {EDIT_FIELDS[bucket].map((field) => (
            <EditFieldControl
              draft={draft}
              field={field}
              key={field.key}
              language={language}
              bucket={bucket}
              t={t}
              onChange={(nextDraft) => setDraft(nextDraft)}
            />
          ))}
        </div>
        <StatusBadge status={object.status} language={language} />
        {validationIssues.length > 0 ? <ValidationBadgeStack issues={validationIssues} t={t} /> : null}
        <div className="row-actions">
          <button type="button" aria-label={`${getObjectLabel(object)} ${t("review.save")}`} onClick={saveEdit}>{t("review.save")}</button>
          <button className="secondary" type="button" aria-label={`${getObjectLabel(object)} ${t("review.cancel")}`} onClick={() => setIsEditing(false)}>{t("review.cancel")}</button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="review-row"
      id={getValidationTargetElementId(bucket, object.id)}
      aria-label={t("review.itemAria", { bucket: titleForBucket(bucket, language), name: getObjectLabel(object) })}
    >
      <div>
        <strong>{getObjectLabel(object)}</strong>
        <p>{getObjectDescription(object, t)}</p>
        {object.sourceTrace?.quote ? <small className="row-note">{t("review.evidence", { quote: object.sourceTrace.quote })}</small> : <small className="row-note">{t("review.noEvidence")}</small>}
        {"resolutionNote" in object && object.resolutionNote ? <small className="row-note">{t("review.resolutionNote", { note: object.resolutionNote })}</small> : null}
      </div>
      <div className="badge-stack">
        {change ? <AnalysisChangeBadge change={change} t={t} /> : null}
        {validationIssues.length > 0 ? <ValidationBadgeStack issues={validationIssues} t={t} /> : null}
        <StatusBadge status={object.status} language={language} />
      </div>
      <div className="row-actions">
        <button type="button" aria-label={`${getObjectLabel(object)} ${t("review.accept")}`} onClick={() => onStatus(bucket, object, "accepted")}>{t("review.accept")}</button>
        <button type="button" aria-label={`${getObjectLabel(object)} ${t("review.edit")}`} onClick={startEdit}>{t("review.edit")}</button>
        <button className="secondary" type="button" aria-label={`${getObjectLabel(object)} ${t("review.defer")}`} onClick={() => onStatus(bucket, object, "deferred")}>{t("review.defer")}</button>
        <button className="danger" type="button" aria-label={`${getObjectLabel(object)} ${t("review.reject")}`} onClick={() => onStatus(bucket, object, "rejected")}>{t("review.reject")}</button>
      </div>
    </article>
  );
}

function titleForBucket(bucket: ObjectBucket, language: AppLanguage): string {
  return getBucketLabel(language, bucket);
}

function EditFieldControl({
  draft,
  field,
  bucket,
  language,
  t,
  onChange,
}: {
  draft: EditDraft;
  field: EditField;
  bucket: ObjectBucket;
  language: AppLanguage;
  t: Translator;
  onChange: (draft: EditDraft) => void;
}) {
  const value = draft[field.key];
  const label = getEditFieldLabel(language, bucket, field.key, field.label);
  if (field.kind === "checkbox") {
    return (
      <label className="checkbox-label">
        <input
          checked={value === true}
          type="checkbox"
          onChange={(event) => onChange({ ...draft, [field.key]: event.target.checked })}
        />
        {label}
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label>
        {label}
        <select value={String(value ?? "")} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}>
          <option value="">{t("review.unknown")}</option>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label>
        {label}
        <textarea value={String(value ?? "")} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })} rows={3} />
      </label>
    );
  }
  return (
    <label>
      {label}
      <input
        type={field.kind === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
      />
    </label>
  );
}

export function StatusBadge({ status, language = "ko" }: { status: SuggestionStatus; language?: AppLanguage }) {
  return <span className={`badge ${status}`}>{getStatusLabel(language, status)}</span>;
}

export function AnalysisChangeBadge({ change, t }: { change: AnalysisChange; t: Translator }) {
  const labelByType: Record<AnalysisChange["changeType"], string> = {
    added_suggestion: t("review.change.added"),
    refreshed_suggestion: t("review.change.refreshed"),
    preserved_confirmed: t("review.change.preservedConfirmed"),
    preserved_review_decision: t("review.change.preservedDecision"),
  };

  return <span className={`change-badge ${change.changeType}`}>{labelByType[change.changeType]}</span>;
}

function ValidationBadgeStack({ issues, t }: { issues: ValidationIssue[]; t: Translator }) {
  return (
    <>
      {issues.map((issue) => (
        <span
          className={`validation-badge ${issue.severity}`}
          key={issue.id}
          title={issue.message}
        >
          {issue.severity === "error" ? t("review.validationBlocked") : t("review.validationWarning")}
        </span>
      ))}
    </>
  );
}

function MergeImpactPanel({
  analysisSummary,
  structureDiff,
  t,
}: {
  analysisSummary?: WorkspaceAnalysisSummary | undefined;
  structureDiff?: StructureDiffReport | undefined;
  t: Translator;
}) {
  if (!analysisSummary && !structureDiff) return null;

  return (
    <div className="merge-impact-panel" aria-label={t("review.mergeImpact")}>
      <strong>{t("review.mergeImpact")}</strong>
      <span>{t("source.newSuggestions", { count: analysisSummary?.addedSuggestedCount ?? structureDiff?.counts.added ?? 0 })}</span>
      <span>{t("source.refreshedSuggestions", { count: analysisSummary?.refreshedSuggestedCount ?? structureDiff?.counts.changed ?? 0 })}</span>
      <span>{t("source.preservedConfirmed", { count: analysisSummary?.preservedConfirmedCount ?? structureDiff?.counts.preserved_confirmed ?? 0 })}</span>
      <span>{t("source.preservedDecisions", { count: analysisSummary?.preservedReviewDecisionCount ?? 0 })}</span>
      <span>{t("diff.statusChanged")} {structureDiff?.counts.status_changed ?? 0}</span>
    </div>
  );
}

function StatusCounts({ counts, language, t }: { counts: Record<ReviewFilter, number>; language: AppLanguage; t: Translator }) {
  return (
    <div className="bucket-status-counts" aria-label={t("review.statusCountsAria")}>
      <span>{getStatusLabel(language, "suggested")} {counts.suggested}</span>
      <span>{getStatusLabel(language, "accepted")} {counts.accepted}</span>
      <span>{getStatusLabel(language, "edited")} {counts.edited}</span>
      <span>{getStatusLabel(language, "deferred")} {counts.deferred}</span>
      <span>{getStatusLabel(language, "rejected")} {counts.rejected}</span>
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

function getObjectDescription(object: XrayObject, t?: Translator): string {
  if ("description" in object && object.description) return object.description;
  if ("text" in object) return object.text;
  if ("actionDescription" in object) return object.actionDescription;
  if ("fieldType" in object) return `${object.name}: ${object.fieldType}`;
  if ("relationType" in object) return `${object.sourceObjectId} → ${object.targetObjectId}`;
  if ("action" in object && t) return `${object.allowed ? t("review.allowed") : t("review.blocked")} ${object.action}`;
  return t ? t("review.descriptionMissing") : "";
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

function filterObjects<T extends XrayObject>(objects: T[], filter: ReviewFilter, searchTerm: string, language: AppLanguage): T[] {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase(searchLocale(language));
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

function filterLabel(filter: ReviewFilter, language: AppLanguage): string {
  if (filter === "all") return language === "ko" ? "전체" : "All";
  return getStatusLabel(language, filter);
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
