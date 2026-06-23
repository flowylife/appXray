# Project Rules

## Product Boundary

App X-Ray is not an app builder.

It is a pre-build product mapping tool for non-developer vibe coders.

The app must help users answer:

1. What am I trying to build?
2. What screens are needed?
3. What information must the app store?
4. What user flows matter?
5. What is missing or ambiguous?
6. What should I ask Codex, Cursor, Lovable, Replit, or Bolt to build?

## Strategic Positioning

Avoid positioning App X-Ray as:

- "AI app builder"
- "no-code builder"
- "full-stack app generator"
- "PRD writer only"
- "diagram tool only"

Preferred positioning:

- "App structure before AI coding"
- "Idea to app map"
- "X-ray your app idea before building"
- "Local-first design map for vibe coders"

## Local-First Rule

Default behavior:

- User project data stays local.
- AI keys are user-owned.
- AI calls use BYOK.
- No token resale.
- No hidden cloud processing.

Cloud features are optional future extensions, not default assumptions.

## BYOK Rule

The app should support the idea that users connect their own AI provider.

Initial providers may include:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter

Provider-specific code must be isolated behind adapters.

## AI Boundary

AI may:

- summarize input documents
- classify app type
- extract requirements
- suggest screens
- suggest data objects
- suggest flows
- find missing parts
- write build prompts
- explain issues in plain language

AI must not:

- silently overwrite confirmed structures
- be the final source of truth
- generate exports directly from raw source text
- manage user permissions
- handle billing logic
- mutate local project data without explicit user action
- decide what is permanently deleted
- store API keys

## Data Boundary

Confirmed project data must be deterministic.

AI output should be stored as structured suggestions.

The user can accept, edit, reject, or defer those suggestions.

## Export Boundary

Exports must be generated from confirmed structured data.

Allowed export types:

- Markdown
- Mermaid
- JSON
- AI build prompt
- GitHub issue markdown format

Do not generate export content directly from a free-form AI response when structured confirmed data exists.

## Marketplace Boundary

Template marketplace is a future platform layer.

The local/open-source app should define and consume templates.

Do not build full payment, seller dashboards, payout systems, reviews, or marketplace ranking unless explicitly requested.

## UX Rules

1. Use plain language first.
2. Hide developer terminology behind "Advanced" sections.
3. Always show the source or reason for a suggestion when possible.
4. Make uncertain AI results visible as "확인 필요".
5. Never make users feel that the PRD is "wrong"; phrase issues as "결정 필요".
6. Make copy/paste workflows easy.
7. Provide visible next actions.

## Naming Rules

Preferred product name:

- App X-Ray

Acceptable internal names:

- App Map
- Data Map
- Flow Map
- Missing Parts
- Build Prompt
- Template Manifest

Avoid inconsistent naming such as:

- PRD Lens
- Spec X-Ray
- Product Lens

Those were exploration names. Use **App X-Ray** unless the task says otherwise.

## Visual Structure

App X-Ray should feel like a product map viewer.

Recommended layout:

- Left: project/source/section navigation
- Center: map or result canvas
- Right: selected node details, issue detail, or prompt panel

## Initial Route Suggestions

- `/`
- `/projects`
- `/projects/new`
- `/projects/:projectId`
- `/projects/:projectId/source`
- `/projects/:projectId/app-map`
- `/projects/:projectId/data-map`
- `/projects/:projectId/flow-map`
- `/projects/:projectId/issues`
- `/projects/:projectId/prompts`
- `/projects/:projectId/export`
- `/settings/ai`

## Quality Rule

It is better to build a narrow, reliable structure mapping tool than a broad, unreliable AI app builder.
