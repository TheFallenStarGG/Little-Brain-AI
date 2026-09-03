# Little Brain AI

Little Brain AI is a transparent, from-scratch conversational model that learns word-to-word transitions as users teach it.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/bigram-ai run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Production requires `SESSION_SECRET` and `GITHUB_TOKEN` for the fixed private
  snapshots repository

## Stack

- pnpm workspaces, Node.js 20+, TypeScript 5.9
- API: Express 5
- Persistence: GitHub Contents API
- Validation: Zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/bigram-ai/src/App.tsx` — responsive chat and model observability workspace
- `artifacts/api-server/src/lib/brain-service.ts` — tokenizer, bigram learner, generator, snapshots, and scheduler
- `artifacts/api-server/src/lib/auth-service.ts` — GitHub-backed accounts, password hashing, sessions, and per-account chat files
- `artifacts/api-server/src/routes/auth.ts` — local account session, signup, login, and logout routes
- `artifacts/api-server/src/routes/admin.ts` — administrator-only account moderation and AI conversation review routes
- `artifacts/bigram-ai/src/pages/admin.tsx` — responsive administrator control room
- `artifacts/api-server/src/routes/brain.ts` — model, chat, snapshot, and GitHub settings routes
- `lib/api-spec/openapi.yaml` — source of truth for the generated API client and Zod contracts

## Architecture decisions

- The model is intentionally a word-level bigram model: it learns only token frequencies and adjacent-token transition counts, with no pretrained weights or external AI calls.
- The private `Bigram-Learning-AI-Snapshots` repository is the single persistence layer. It stores the live model state, timestamped model snapshots, account records, personal histories, and shared chat rooms.
- Before every new model message, the API loads the latest live GitHub model state, then writes the updated state back to GitHub. A five-minute server-side timer and the manual Save now action create timestamped backups.
- Local username/password accounts are independent of hosted identity providers
  and use the fixed private GitHub repository directly.
- Administrator access is stored on account records and enforced on the backend. Admins can review only direct AI chats and group rooms that include Little Brain; user-only rooms are never returned.
- Banning an account invalidates its server-checked sessions, blocks future login, deletes its direct AI history, and removes its messages from shared rooms. The repository-owner account is the initial administrator.
- Group rooms support multiple participants, optional Little Brain participation, shared owner-controlled names, and participant-only access. The frontend uses generated API hooks so chat, metrics, snapshot history, and backup status consume the same contract.

## Product

Users first acknowledge the model disclaimer, then create or sign into a local account before teaching the shared model in a private chat. They can see vocabulary/bigram/message counts grow, inspect timestamped snapshots, and save a snapshot immediately. The GitHub destination is fixed and is not editable from the UI.
Administrators also have an `/admin` control room for reviewing AI-involving conversations, account status, bans, and username-based administrator promotion.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Sources tab links only to the imported source repository. Snapshot files and conversation memory stay in the separate private backup repository.
- Keep `lib/api-spec/openapi.yaml` and generated clients in sync by running the API codegen command after contract changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
