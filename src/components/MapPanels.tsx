import { useMemo, useState } from "react";
import { isConfirmedXrayObject } from "../domain/status.js";
import type { DataField, DataObject, DataRelation, Feature, Issue, Screen, SuggestionStatus } from "../domain/types.js";
import { getStatusLabel, type AppLanguage, type Translator } from "../i18n.js";
import { StatusBadge } from "./ReviewPanel.js";

type MapStatusFilter = "all" | SuggestionStatus;
const MAP_FILTERS: MapStatusFilter[] = ["all", "suggested", "accepted", "edited", "rejected", "deferred"];

export function MapPanels({
  screens,
  features,
  dataObjects,
  dataFields,
  dataRelations,
  language,
  t,
}: {
  screens: Screen[];
  features: Feature[];
  dataObjects: DataObject[];
  dataFields: DataField[];
  dataRelations: DataRelation[];
  language: AppLanguage;
  t: Translator;
}) {
  return (
    <section className="map-grid">
      <div className="panel" id="app-map">
        <div className="section-heading">
          <span>{t("map.appSection")}</span>
          <h2>{t("map.appTitle")}</h2>
        </div>
        <AppMap features={features} screens={screens} language={language} t={t} />
      </div>
      <div className="panel" id="data-map">
        <div className="section-heading">
          <span>{t("map.dataSection")}</span>
          <h2>{t("map.dataTitle")}</h2>
        </div>
        <DataMap fields={dataFields} objects={dataObjects} relations={dataRelations} language={language} t={t} />
      </div>
    </section>
  );
}

export function MissingParts({
  issues,
  onTogglePrompt,
  language = "ko",
  t,
}: {
  issues: Issue[];
  onTogglePrompt: (issue: Issue) => void;
  language?: AppLanguage;
  t: Translator;
}) {
  if (issues.length === 0) return <p className="muted">{t("map.noIssues")}</p>;

  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <article className="issue" key={issue.id}>
          <span>{issue.severity}</span>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.description}</p>
            {issue.suggestion ? <small>{issue.suggestion}</small> : null}
            {issue.resolutionNote ? <small>{t("review.resolutionNote", { note: issue.resolutionNote })}</small> : null}
          </div>
          <div className="issue-actions">
            <StatusBadge status={issue.status} language={language} />
            <button className="secondary" type="button" onClick={() => onTogglePrompt(issue)}>
              {issue.includeInPrompt === false ? t("map.includePrompt") : t("map.excludePrompt")}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AppMap({ screens, features, language, t }: { screens: Screen[]; features: Feature[]; language: AppLanguage; t: Translator }) {
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

  if (screens.length === 0) return <p className="muted">{t("map.noScreens")}</p>;

  return (
    <>
      <MapFilter filter={filter} language={language} onFilter={setFilter} />
      <div className="map-edge-list">
        {visibleFeatures.map((feature) => (
          <span className={feature.screenId && visibleScreenIds.has(feature.screenId) ? "" : "broken"} key={feature.id}>
            {t("map.screenFeatureEdge", { name: feature.name })}
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
            <StatusBadge status={screen.status} language={language} />
          </button>
        ))}
      </div>
      {selectedScreen ? (
        <div className="map-detail">
          <h3>{selectedScreen.displayName ?? selectedScreen.name}</h3>
          <p>{selectedScreen.description ?? t("review.descriptionMissing")}</p>
          <small>{t("map.connectedFeatures", { count: selectedFeatures.length })}</small>
          <ul>
            {selectedFeatures.length > 0 ? (
              selectedFeatures.map((feature) => <li key={feature.id}>{feature.name}</li>)
            ) : (
              <li>{t("map.noConnectedFeatures")}</li>
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
  language,
  t,
}: {
  objects: DataObject[];
  fields: DataField[];
  relations: DataRelation[];
  language: AppLanguage;
  t: Translator;
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

  if (objects.length === 0) return <p className="muted">{t("map.noDataObjects")}</p>;

  return (
    <>
      <MapFilter filter={filter} language={language} onFilter={setFilter} />
      <div className="map-edge-list">
        {visibleRelations.map((relation) => (
          <span
            className={visibleObjectIds.has(relation.sourceObjectId) && visibleObjectIds.has(relation.targetObjectId) ? "" : "broken"}
            key={relation.id}
          >
            {t("map.relationEdge", { type: relation.relationType })}
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
            <StatusBadge status={object.status} language={language} />
          </button>
        ))}
      </div>
      {selectedObject ? (
        <div className="map-detail">
          <h3>{selectedObject.displayName ?? selectedObject.name}</h3>
          <p>{selectedObject.description ?? t("review.descriptionMissing")}</p>
          <small>{t("map.fieldRelationCounts", { fields: selectedFields.length, relations: selectedRelations.length })}</small>
          <ul>
            {selectedFields.length > 0 ? (
              selectedFields.map((field) => (
                <li key={field.id}>
                  {field.displayName ?? field.name} <span>{field.fieldType}</span>
                </li>
              ))
            ) : (
              <li>{t("map.noFields")}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
    </>
  );
}

function MapFilter({
  filter,
  language,
  onFilter,
}: {
  filter: MapStatusFilter;
  language: AppLanguage;
  onFilter: (filter: MapStatusFilter) => void;
}) {
  return (
    <div className="map-filter" aria-label="Map status filter">
      {MAP_FILTERS.map((nextFilter) => (
        <button
          className={filter === nextFilter ? "active" : "secondary"}
          key={nextFilter}
          type="button"
          onClick={() => onFilter(nextFilter)}
        >
          {nextFilter === "all" ? (language === "ko" ? "전체" : "All") : getStatusLabel(language, nextFilter)}
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
