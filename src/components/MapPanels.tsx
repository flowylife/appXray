import { isConfirmedXrayObject } from "../domain/status.js";
import type { DataObject, Issue, Screen } from "../domain/types.js";
import { StatusBadge } from "./ReviewPanel.js";

export function MapPanels({ screens, dataObjects }: { screens: Screen[]; dataObjects: DataObject[] }) {
  return (
    <section className="map-grid">
      <div className="panel" id="app-map">
        <div className="section-heading">
          <span>앱 지도</span>
          <h2>화면과 기능</h2>
        </div>
        <AppMap screens={screens} />
      </div>
      <div className="panel" id="data-map">
        <div className="section-heading">
          <span>정보 구조</span>
          <h2>앱이 저장할 정보</h2>
        </div>
        <DataMap objects={dataObjects} />
      </div>
    </section>
  );
}

export function MissingParts({ issues }: { issues: Issue[] }) {
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
          </div>
          <StatusBadge status={issue.status} />
        </article>
      ))}
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
