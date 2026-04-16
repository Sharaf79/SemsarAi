## Semsar AI — Project Context

**Architecture**: 2-Phase system (see `.claude/commands/speckit.constitution.md`)
- **Phase 1**: Guided Data Collection — strict state machine (NOT free chat), one question per step
- **Phase 2**: Negotiation Engine — algorithm-driven (AI only formats messages, never decides)

**Stack**: NestJS 11 + Prisma 6.x + MySQL 8 + Gemini 2.5 Flash
**Language**: Egyptian Arabic (polite register) for all user-facing text

## Review Checklist
- All new code goes in `backend/` (NestJS + TypeScript).
- Database queries go through Prisma only (MySQL).
- AI (Gemini) is the communication layer — backend enforces ALL logic.
- Onboarding uses `PropertyDraft` state machine — no free chat for data collection.
- Negotiation uses algorithm with bounded user actions — no free text.
- Egyptian Arabic (فصحي  مهذبة) for user-facing strings.
- `app/` = FastAPI chat UI (development/demo only).
- `_archive/` = old Python MVP (reference only, not active).

## Key Files
- Constitution: `.claude/commands/speckit.constitution.md`
- Specification: `.claude/commands/speckit.specify.md`
- Plan: `specs/000-master-plan/plan.md`
- Tasks: `specs/000-master-plan/tasks.md` (74 tasks, T01–T74)
- Prisma Schema: `backend/prisma/schema.prisma`