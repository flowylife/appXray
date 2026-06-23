import { useMemo, useState } from "react";
import { isConfirmedXrayObject } from "../domain/status.js";
import type { DataField, DataObject, DataRelation, Feature, Issue, Screen } from "../domain/types.js";
import { StatusBadge } from "./ReviewPanel.js";

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
  const [selectedScreenId, setSelectedScreenId] = useState(screens[0]?.id ?? "");
  const selectedScreen = useMemo(
    () => screens.find((screen) => screen.id === selectedScreenId) ?? screens[0],
    [screens, selectedScreenId],
  );
  const selectedFeatures = selectedScreen ? features.filter((feature) => feature.screenId === selectedScreen.id) : [];

  if (screens.length === 0) return <p className="muted">아직 화면 제안이 없습니다.</p>;

  return (
    <div className="map-detail-grid">
      <div className="node-list">
        {screens.map((screen) => (
          <button
            className={`node ${isConfirmedXrayObject(screen) ? "confirmed" : ""} ${selectedScreen?.id === screen.id ? "selected" : ""}`}
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
  const [selectedObjectId, setSelectedObjectId] = useState(objects[0]?.id ?? "");
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? objects[0],
    [objects, selectedObjectId],
  );
  const selectedFields = selectedObject ? fields.filter((field) => field.dataObjectId === selectedObject.id) : [];
  const selectedRelations = selectedObject
    ? relations.filter(
        (relation) => relation.sourceObjectId === selectedObject.id || relation.targetObjectId === selectedObject.id,
      )
    : [];

  if (objects.length === 0) return <p className="muted">아직 저장할 정보 제안이 없습니다.</p>;

  return (
    <div className="map-detail-grid">
      <div className="node-list">
        {objects.map((object) => (
          <button
            className={`node ${isConfirmedXrayObject(object) ? "confirmed" : ""} ${selectedObject?.id === object.id ? "selected" : ""}`}
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
  );
}
