import { useMemo, useState } from "react";
import { isConfirmedXrayObject } from "../domain/status.js";
import type { DataField, DataObject, DataRelation, Feature, Issue, Screen, SuggestionStatus } from "../domain/types.js";
import { STATUS_LABELS, StatusBadge } from "./ReviewPanel.js";

type MapStatusFilter = "all" | SuggestionStatus;
const MAP_FILTERS: MapStatusFilter[] = ["all", "suggested", "accepted", "edited", "rejected", "deferred"];

export function MapPanels({
  screens,
  features,
  dataObjects,
  dataFields,
  dataRelations,
}: {
  screens: Screen[];
  features: Feature[];
  dataObjects: DataObject[];
  dataFields: DataField[];
  dataRelations: DataRelation[];
}) {
  return (
    <section className="map-grid">
      <div className="panel" id="app-map">
        <div className="section-heading">
          <span>앱 지도</span>
          <h2>화면과 기능</h2>
        </div>
        <AppMap features={features} screens={screens} />
      </div>
      <div className="panel" id="data-map">
        <div className="section-heading">
          <span>정보 구조</span>
          <h2>앱이 저장할 정보</h2>
        </div>
        <DataMap fields={dataFields} objects={dataObjects} relations={dataRelations} />
      </div>
    </section>
  );
}

export function MissingParts({
  issues,
  onTogglePrompt,
}: {
  issues: Issue[];
  onTogglePrompt: (issue: Issue) => void;
}) {
  if (issues.length === 0) return <p className="muted">아직 빠진 것이 없습니다.</p>;

  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <article className="issue" key={issue.id}>
          <span>{issue.severity}</span>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.description}</p>
            {issue.suggestion ? <small>{issue.suggestion}</small> : null}
            {issue.resolutionNote ? <small>결정 메모: {issue.resolutionNote}</small> : null}
          </div>
          <div className="issue-actions">
            <StatusBadge status={issue.status} />
            <button className="secondary" type="button" onClick={() => onTogglePrompt(issue)}>
              {issue.includeInPrompt === false ? "프롬프트 포함" : "프롬프트 제외"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AppMap({ screens, features }: { screens: Screen[]; features: Feature[] }) {
  const [filter, setFilter] = useState<MapStatusFilter>("all");
  const visibleScreens = filterByStatus(screens, filter);
  const visibleScreenIds = new Set(visibleScreens.map((screen) => screen.id));
  const visibleFeatures = features.filter((feature) => filter === "all" || feature.status === filter);
  const [selectedScreenId, setSelectedScreenId] = useState(screens[0]?.id ?? "");
  const selectedScreen = useMemo(
    () => visibleScreens.find((screen) => screen.id === selectedScreenId) ?? visibleScreens[0],
    [visibleScreens, selectedScreenId],
  );
  const selectedFeatures = selectedScreen ? visibleFeatures.filter((feature) => feature.screenId === selectedScreen.id) : [];

  if (screens.length === 0) return <p className="muted">아직 화면 제안이 없습니다.</p>;

  return (
    <>
      <MapFilter filter={filter} onFilter={setFilter} />
      <div className="map-edge-list">
        {visibleFeatures.map((feature) => (
          <span className={feature.screenId && visibleScreenIds.has(feature.screenId) ? "" : "broken"} key={feature.id}>
            화면 → 기능 · {feature.name}
          </span>
        ))}
      </div>
      <div className="map-detail-grid">
      <div className="node-list">
        {visibleScreens.map((screen) => (
          <button
            className={`node ${statusClass(screen.status)} ${isConfirmedXrayObject(screen) ? "confirmed" : ""} ${selectedScreen?.id === screen.id ? "selected" : ""}`}
            key={screen.id}
            type="button"
            onClick={() => setSelectedScreenId(screen.id)}
          >
            <span>{screen.screenType}</span>
            <strong>{screen.displayName ?? screen.name}</strong>
            <StatusBadge status={screen.status} />
          </button>
        ))}
      </div>
      {selectedScreen ? (
        <div className="map-detail">
          <h3>{selectedScreen.displayName ?? selectedScreen.name}</h3>
          <p>{selectedScreen.description ?? "설명이 없습니다."}</p>
          <small>연결된 기능 {selectedFeatures.length}개</small>
          <ul>
            {selectedFeatures.length > 0 ? (
              selectedFeatures.map((feature) => <li key={feature.id}>{feature.name}</li>)
            ) : (
              <li>아직 연결된 기능이 없습니다.</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
    </>
  );
}

function DataMap({
  objects,
  fields,
  relations,
}: {
  objects: DataObject[];
  fields: DataField[];
  relations: DataRelation[];
}) {
  const [filter, setFilter] = useState<MapStatusFilter>("all");
  const visibleObjects = filterByStatus(objects, filter);
  const visibleObjectIds = new Set(visibleObjects.map((object) => object.id));
  const visibleRelations = filterByStatus(relations, filter);
  const [selectedObjectId, setSelectedObjectId] = useState(objects[0]?.id ?? "");
  const selectedObject = useMemo(
    () => visibleObjects.find((object) => object.id === selectedObjectId) ?? visibleObjects[0],
    [visibleObjects, selectedObjectId],
  );
  const selectedFields = selectedObject ? fields.filter((field) => field.dataObjectId === selectedObject.id) : [];
  const selectedRelations = selectedObject
    ? visibleRelations.filter(
        (relation) => relation.sourceObjectId === selectedObject.id || relation.targetObjectId === selectedObject.id,
      )
    : [];

  if (objects.length === 0) return <p className="muted">아직 저장할 정보 제안이 없습니다.</p>;

  return (
    <>
      <MapFilter filter={filter} onFilter={setFilter} />
      <div className="map-edge-list">
        {visibleRelations.map((relation) => (
          <span
            className={visibleObjectIds.has(relation.sourceObjectId) && visibleObjectIds.has(relation.targetObjectId) ? "" : "broken"}
            key={relation.id}
          >
            정보 연결 · {relation.relationType}
          </span>
        ))}
      </div>
      <div className="map-detail-grid">
      <div className="node-list">
        {visibleObjects.map((object) => (
          <button
            className={`node ${statusClass(object.status)} ${isConfirmedXrayObject(object) ? "confirmed" : ""} ${selectedObject?.id === object.id ? "selected" : ""}`}
            key={object.id}
            type="button"
            onClick={() => setSelectedObjectId(object.id)}
          >
            <span>{object.objectType}</span>
            <strong>{object.displayName ?? object.name}</strong>
            <StatusBadge status={object.status} />
          </button>
        ))}
      </div>
      {selectedObject ? (
        <div className="map-detail">
          <h3>{selectedObject.displayName ?? selectedObject.name}</h3>
          <p>{selectedObject.description ?? "설명이 없습니다."}</p>
          <small>필드 {selectedFields.length}개 · 관계 {selectedRelations.length}개</small>
          <ul>
            {selectedFields.length > 0 ? (
              selectedFields.map((field) => (
                <li key={field.id}>
                  {field.displayName ?? field.name} <span>{field.fieldType}</span>
                </li>
              ))
            ) : (
              <li>아직 필드가 없습니다.</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
    </>
  );
}

function MapFilter({ filter, onFilter }: { filter: MapStatusFilter; onFilter: (filter: MapStatusFilter) => void }) {
  return (
    <div className="map-filter" aria-label="Map status filter">
      {MAP_FILTERS.map((nextFilter) => (
        <button
          className={filter === nextFilter ? "active" : "secondary"}
          key={nextFilter}
          type="button"
          onClick={() => onFilter(nextFilter)}
        >
          {nextFilter === "all" ? "전체" : STATUS_LABELS[nextFilter]}
        </button>
      ))}
    </div>
  );
}

function filterByStatus<T extends { status: SuggestionStatus }>(objects: T[], filter: MapStatusFilter): T[] {
  if (filter === "all") return objects;
  return objects.filter((object) => object.status === filter);
}

function statusClass(status: SuggestionStatus): string {
  return `status-${status}`;
}
