import type { TemplateManifest } from "../domain/template.js";

export const fieldPowerTemplate = {
  schemaVersion: "1.0.0",
  templateId: "field_power_operations",
  name: "현장 전력설비 운영 템플릿",
  slug: "field-power-operations",
  version: "1.0.0",
  description: "현장 전력설비 점검, 부하 관리, 알람 확인을 시작하기 위한 App X-Ray 템플릿입니다.",
  category: "internal-tool",
  tags: ["전력설비", "점검", "알람", "현장운영"],
  appTypes: ["internal_tool", "asset_management", "dashboard"],
  targetUsers: ["현장 작업자", "설비 관리자"],
  screens: [
    {
      id: "dashboard",
      name: "field_dashboard",
      displayName: "현장 대시보드",
      description: "주요 알람과 오늘 점검할 설비를 한눈에 보는 화면",
      screenType: "dashboard",
    },
    {
      id: "asset_detail",
      name: "asset_detail",
      displayName: "설비 상세",
      description: "설비 기본 정보와 최근 점검 이력을 보는 화면",
      screenType: "detail",
    },
  ],
  dataObjects: [
    {
      id: "asset",
      name: "asset",
      displayName: "설비",
      description: "현장에서 관리해야 하는 전력설비",
      objectType: "asset",
      fields: [
        { id: "name", name: "name", displayName: "설비명", fieldType: "text", required: true },
        { id: "status", name: "status", displayName: "상태", fieldType: "enum", enumValues: ["normal", "warning", "critical"] },
      ],
    },
    {
      id: "inspection",
      name: "inspection_record",
      displayName: "점검 기록",
      description: "설비별 점검 결과",
      objectType: "record",
      fields: [
        { id: "checkedAt", name: "checkedAt", displayName: "점검일", fieldType: "date", required: true },
        { id: "memo", name: "memo", displayName: "메모", fieldType: "text" },
      ],
    },
  ],
  dataRelations: [
    {
      id: "asset_has_inspection",
      sourceObjectId: "asset",
      targetObjectId: "inspection",
      relationType: "one_to_many",
      description: "설비는 여러 점검 기록을 가집니다.",
    },
  ],
  roles: [
    { id: "worker", name: "worker", displayName: "현장 작업자", description: "점검을 수행하는 사용자" },
    { id: "manager", name: "manager", displayName: "관리자", description: "설비 정보를 관리하는 사용자" },
  ],
  permissions: [
    { id: "worker_view_asset", roleId: "worker", targetType: "dataObject", targetId: "asset", action: "view", allowed: true },
    { id: "manager_edit_asset", roleId: "manager", targetType: "dataObject", targetId: "asset", action: "edit", allowed: true },
  ],
  flows: [
    {
      id: "inspect_asset",
      name: "설비 점검 흐름",
      description: "작업자가 설비를 확인하고 점검 기록을 남기는 흐름",
      primaryRoleId: "worker",
      steps: [
        { id: "open_dashboard", stepOrder: 1, screenId: "dashboard", actionDescription: "오늘 점검할 설비를 확인한다." },
        { id: "open_asset", stepOrder: 2, screenId: "asset_detail", dataObjectId: "asset", actionDescription: "설비 상세 정보를 확인한다." },
      ],
    },
  ],
  issues: [
    {
      id: "alarm_rule",
      issueType: "missing",
      severity: "high",
      title: "알람 기준 결정 필요",
      description: "어떤 상태를 알람으로 볼지 아직 정해야 합니다.",
      suggestion: "초기에는 normal, warning, critical 세 단계로 시작하세요.",
    },
  ],
  promptPacks: [
    {
      id: "codex_mvp",
      targetTool: "codex",
      title: "전력설비 운영 MVP 구현",
      prompt: "확정된 화면과 저장 정보를 기반으로 로컬 우선 MVP를 구현하세요.",
    },
  ],
  exports: [
    { id: "default_markdown", type: "markdown", title: "기본 Markdown" },
  ],
} satisfies TemplateManifest;
