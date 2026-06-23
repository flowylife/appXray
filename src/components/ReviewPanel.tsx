import { useState } from "react";
import type { DataObject, Issue, Screen, SuggestionStatus, XrayObject, XraySuggestionSet } from "../domain/types.js";

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: "검토 대기",
  accepted: "확정",
  edited: "수정 확정",
  rejected: "제외",
  deferred: "나중에 결정",
};

const REVIEW_FILTERS: ReviewFilter[] = ["all", "suggested", "accepted", "edited", "rejected", "deferred"];

export type ObjectBucket = keyof XraySuggestionSet;
export type ReviewFilter = "all" | SuggestionStatus;

export type EditableXrayObject = Screen | DataObject | Issue;

export function ReviewPanel({
  objects,
  onStatus,
  onEdit,
}: {
  objects: XraySuggestionSet;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const counts = countByStatus([...objects.screens, ...objects.dataObjects, ...objects.issues]);

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
      <ReviewGroup title="화면" bucket="screens" filter={filter} objects={objects.screens} onStatus={onStatus} onEdit={onEdit} />
      <ReviewGroup title="앱이 저장할 정보" bucket="dataObjects" filter={filter} objects={objects.dataObjects} onStatus={onStatus} onEdit={onEdit} />
      <ReviewGroup title="빠진 것" bucket="issues" filter={filter} objects={objects.issues} onStatus={onStatus} onEdit={onEdit} />
    </section>
  );
}

function ReviewGroup({
  title,
  bucket,
  objects,
  filter,
  onStatus,
  onEdit,
}: {
  title: string;
  bucket: ObjectBucket;
  filter: ReviewFilter;
  objects: EditableXrayObject[];
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
  onStatus,
  onEdit,
}: {
  bucket: ObjectBucket;
  object: EditableXrayObject;
  onStatus: (bucket: ObjectBucket, object: XrayObject, status: SuggestionStatus) => void;
  onEdit: (bucket: ObjectBucket, object: EditableXrayObject, patch: Partial<EditableXrayObject>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(object));

  function startEdit() {
    setDraft(createDraft(object));
    setIsEditing(true);
  }

  function saveEdit() {
    onEdit(bucket, object, createPatch(object, draft));
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <article className="review-row editing">
        <div className="edit-fields">
          {isIssue(object) ? (
            <>
              <label>
                제목
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                설명
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} />
              </label>
              <label>
                제안
                <textarea value={draft.suggestion} onChange={(event) => setDraft({ ...draft, suggestion: event.target.value })} rows={2} />
              </label>
            </>
          ) : (
            <>
              <label>
                쉬운 이름
                <input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
              </label>
              <label>
                설명
                <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} />
              </label>
            </>
          )}
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
      </div>
      <StatusBadge status={object.status} />
      <div className="row-actions">
        <button type="button" onClick={() => onStatus(bucket, object, "accepted")}>확정</button>
        <button type="button" onClick={startEdit}>수정</button>
        <button className="secondary" type="button" onClick={() => onStatus(bucket, object, "deferred")}>나중</button>
        <button className="danger" type="button" onClick={() => onStatus(bucket, object, "rejected")}>제외</button>
      </div>
    </article>
  );
}

export function StatusBadge({ status }: { status: SuggestionStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}

export function getObjectLabel(object: XrayObject): string {
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

function createDraft(object: EditableXrayObject): EditDraft {
  if (isIssue(object)) {
    return {
      title: object.title,
      description: object.description,
      suggestion: object.suggestion ?? "",
      displayName: "",
    };
  }

  return {
    title: "",
    displayName: object.displayName ?? object.name,
    description: object.description ?? "",
    suggestion: "",
  };
}

function createPatch(object: EditableXrayObject, draft: EditDraft): Partial<EditableXrayObject> {
  if (isIssue(object)) {
    return {
      title: draft.title.trim() || object.title,
      description: draft.description.trim() || object.description,
      suggestion: draft.suggestion.trim() || undefined,
    } as Partial<Issue>;
  }

  return {
    displayName: draft.displayName.trim() || object.name,
    description: draft.description.trim() || undefined,
  } as Partial<Screen | DataObject>;
}

function isIssue(object: EditableXrayObject): object is Issue {
  return "issueType" in object;
}

function filterObjects<T extends EditableXrayObject>(objects: T[], filter: ReviewFilter): T[] {
  if (filter === "all") return objects;
  return objects.filter((object) => object.status === filter);
}

function countByStatus(objects: EditableXrayObject[]): Record<ReviewFilter, number> {
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

type EditDraft = {
  title: string;
  displayName: string;
  description: string;
  suggestion: string;
};
