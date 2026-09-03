# Little Brain AI

Little Brain AI is a transparent, from-scratch conversational language model. Users
teach it through a live chat; it learns token frequencies and word-to-word
transitions, generates a response from those transitions, and exposes the
model's state through an observability-focused web interface.

The project is intentionally not an AI API wrapper. It has no pretrained
weights, embeddings, retrieval system, external model calls, or hidden
inference layer.

## Project status and repositories

- Imported source repository:
  `https://github.com/TheFallenStarGG/Bigram-Learning-AI`
- Private model backup repository:
  `TheFallenStarGG/Bigram-Learning-AI-Snapshots`
- The source repository is linked from the app's **Sources** tab.
- The snapshot repository is deliberately not linked from the public UI and
  must remain private.

The GitHub backup repository is created and selected by the application. The
frontend does not provide a repository picker or GitHub connection button.

## Technology stack

- Node.js 20+
- pnpm workspaces
- TypeScript 5.9
- React 19 + Vite 7
- Tailwind CSS 4
- Wouter for frontend routing
- TanStack React Query for API state
- Express 5 API server
- PostgreSQL
- Drizzle ORM and Drizzle Kit
- Zod contracts generated from OpenAPI
- Orval-generated React Query hooks
- esbuild for the API production bundle
- GitHub Contents API authenticated with `GITHUB_TOKEN`

## Repository layout

```text
.
├── artifacts/
│   ├── api-server/
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── brain-service.ts
│   │   │   │   ├── auth-service.ts
│   │   │   │   ├── github.ts
│   │   │   │   └── logger.ts
│   │   │   └── routes/
│   │   │       ├── auth.ts
│   │   │       ├── brain.ts
│   │   │       ├── health.ts
│   │   │       └── index.ts
│   │   ├── build.mjs
│   │   └── package.json
│   ├── bigram-ai/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   └── index.css
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── mockup-sandbox/
│       └── ...
├── lib/
│   ├── api-client-react/       # Generated React Query client
│   ├── api-spec/               # OpenAPI source and Orval config
│   ├── api-zod/                # Generated server/client Zod contracts
│   └── db/                     # Drizzle database package and schema
├── scripts/                    # Workspace utility scripts
├── package.json                # Root scripts and tooling
├── pnpm-workspace.yaml         # Workspace packages, catalog, security rules
├── pnpm-lock.yaml
├── tsconfig.json               # TypeScript project references
├── .replit                     # Optional local workspace settings
└── replit.md                   # Project architecture notes
```

## Prerequisites

1. Node.js 20+
2. pnpm 10+
3. A PostgreSQL database for the live shared model cache
4. A GitHub fine-grained token with Contents read/write access to the fixed
   private snapshot repository
5. A strong `SESSION_SECRET` for signed account sessions

The API server intentionally fails if `DATABASE_URL`, `GITHUB_TOKEN`, or
`SESSION_SECRET` is missing in production. Do not put database credentials,
GitHub tokens, or other secrets in this README or in source code.

## Install dependencies

Use pnpm, not npm or yarn:

```bash
pnpm install --frozen-lockfile
```

The workspace enforces a 1-day minimum package release age as a supply-chain
protection. Do not disable `minimumReleaseAge` in `pnpm-workspace.yaml`.

## Local development

Run the API and web app in separate terminals. The production Render service
uses one Express process that serves both the API and the built frontend.

### API server

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

The API `dev` script builds the server first and then starts the generated
bundle.

### Main web app

```bash
PORT=26237 BASE_PATH=/ pnpm --filter @workspace/bigram-ai run dev
```

### Canvas preview

```bash
PORT=8081 BASE_PATH=/__mockup pnpm --filter @workspace/mockup-sandbox run dev
```

For local API checks, use the API service port directly:

```bash
curl http://localhost:8080/api/healthz
curl http://localhost:8080/api/brain/overview
```

## Database setup and schema

The application uses the provisioned development PostgreSQL database. The
database package is `@workspace/db`.

Push the current Drizzle schema to the development database:

```bash
pnpm --filter @workspace/db run push
```

This is a schema setup operation. Do not add startup-time DDL or custom
migration scripts. Run it with the `DATABASE_URL` for the Render PostgreSQL
database before the first production launch.

The schema is defined in `lib/db/src/schema/brain.ts` and exported through
`lib/db/src/schema/index.ts`.

### Tables

#### `brain_state`

There is one application-wide row with `id = 1`.

- `vocabulary`: JSON object mapping each normalized token to its count
- `transitions`: JSON object mapping a token to possible next-token counts
- `message_count`: number of user messages learned
- `learning_started_at`: first model initialization timestamp
- `last_snapshot_at`: timestamp of the latest local/remote snapshot

#### `chat_messages` (legacy)

This table is retained for compatibility with the original schema but is no
longer used for user-facing conversation history. New account conversations
are stored in the private GitHub repository.

#### `model_snapshots`

Stores snapshot history and upload state:

- `id`
- `filename`
- `created_at`
- `vocabulary`
- `bigrams`
- `messages`
- `status`: `local`, `github`, or `failed`
- `error`

#### `github_settings`

There is one application-wide row with `id = 1`.

- `owner`
- `repository`
- `branch`
- `configured`
- `updated_at`

The current permanent values are the `TheFallenStarGG` owner,
`Bigram-Learning-AI-Snapshots` repository, and `main` branch. If the backup
repository ever changes, update the backend defaults and migrate the existing
settings row deliberately; do not expose repository configuration in the
public UI.

## Root commands

Run the full workspace typecheck:

```bash
pnpm run typecheck
```

This builds the composite library declarations first, then typechecks all leaf
artifacts and scripts.

Run only the shared library declaration build:

```bash
pnpm run typecheck:libs
```

Typecheck individual packages:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bigram-ai run typecheck
pnpm --filter @workspace/mockup-sandbox run typecheck
pnpm --filter @workspace/scripts run typecheck
```

Build the API bundle:

```bash
pnpm --filter @workspace/api-server run build
```

The API bundle is emitted to `artifacts/api-server/dist/index.mjs`.

Build the frontend:

```bash
PORT=26237 BASE_PATH=/ pnpm --filter @workspace/bigram-ai run build
```

The frontend production files are emitted to
`artifacts/bigram-ai/dist/public`.

The root build command is:

```bash
pnpm run build
```

Because Vite requires `PORT` and `BASE_PATH` at config-load time, use the
managed build/deployment workflow or provide the required variables when
running frontend builds from a bare shell.

There is no configured automated test suite or test script at present.
`pnpm run typecheck` is the current repository-wide static validation command.

## OpenAPI and generated clients

`lib/api-spec/openapi.yaml` is the source of truth for the API contract.

Generated outputs:

- `lib/api-client-react/src/generated/`
- `lib/api-zod/src/generated/`

After changing an API route's request or response shape:

1. Update `lib/api-spec/openapi.yaml`.
2. Regenerate the client and Zod contracts:

   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```

3. Update the Express route and its callers.
4. Run `pnpm run typecheck`.

Do not hand-edit generated files. Keep the OpenAPI title as `Api`; generated
import paths depend on it.

The frontend uses the generated hooks from `@workspace/api-client-react`.
Requests use the generated custom fetcher and the `/api` base path. Do not
hard-code a host or service port into browser code.

## HTTP API

The API is mounted at `/api`. These are the current routes.

### Health

```http
GET /api/healthz
```

Returns a small health object with `status`.

### Local accounts

The application account flow is intentionally separate from hosted identity
providers. The server creates and verifies local username/password accounts
using the fixed private GitHub repository:

```http
GET /api/auth/session
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
```

Account files are stored under:

```text
accounts/<normalized-username>.json
```

Only a salted password hash is stored. Successful signup and login set an
HTTP-only signed session cookie. The session cookie contains no password and
does not require an account row in PostgreSQL.

Administrator status is stored on the private account record and checked by
the backend for every admin request. The `/admin` workspace is limited to
direct AI conversations and group conversations that include Little Brain;
user-only rooms are never returned. Administrators can view account status,
grant administrator access to an existing username, and ban accounts. A ban
blocks future logins, invalidates the account's server-checked sessions,
deletes its direct AI chat history, and removes that account's messages from
shared rooms. The repository-owner account is initialized as the first
administrator.

Admin endpoints:

```http
GET /api/admin/accounts
GET /api/admin/chats
GET /api/admin/chats/:chatId
POST /api/admin/accounts/:username/ban
POST /api/admin/admins
```

### Model overview

```http
GET /api/brain/overview
```

Returns:

- `vocabulary`
- `bigrams`
- `messages`
- `learningStartedAt`
- `lastSnapshotAt`
- `nextSnapshotAt`
- `githubConfigured`
- `githubConnected`

`githubConnected` currently reflects the permanent configured backup state; it
does not perform a live GitHub probe on every overview request.

### Conversation history

```http
GET /api/brain/messages
```

Returns the signed-in account's messages in chronological order. The request
must include the account session cookie.

### Teach and respond

```http
POST /api/brain/chat
Content-Type: application/json

{
  "message": "A sentence for the brain to learn."
}
```

`message` must contain between 1 and 2,000 characters. The response contains:

- `userMessage`
- `assistantMessage`
- updated `overview`

Before learning from the message, the server loads the latest model snapshot
from the private GitHub repository when one exists. The shared model's
vocabulary, transitions, and message count are refreshed from that snapshot;
the signed-in user's chat is written separately under that user's account
folder.

### Snapshot history

```http
GET /api/brain/snapshots
POST /api/brain/snapshots
```

`POST` creates a complete JSON snapshot locally and attempts to write the same
content to GitHub. The returned snapshot status is:

- `github` when the remote write succeeds
- `failed` when local creation succeeds but the GitHub write fails
- `local` only when GitHub backup is not configured

### Permanent GitHub settings

```http
GET /api/brain/github
PUT /api/brain/github
```

The GET route reports the fixed private backup destination and connection
state. The PUT route remains in the generated contract for compatibility with
the original project, but normal users should not call it: the UI no longer
exposes repository editing or GitHub connection setup.

## Model behavior

The implementation is in
`artifacts/api-server/src/lib/brain-service.ts`.

### Tokenization

Input is lowercased with `toLocaleLowerCase()` and tokenized using:

```text
[a-z0-9]+(?:'[a-z0-9]+)?|[.,!?;:]
```

Words and supported punctuation are tokens. Empty token lists are ignored.

### Learning

Each learned message starts at the special `__START__` token. For every token:

1. Increment its vocabulary count.
2. Increment the transition count from the previous token to the current token.
3. Move the previous-token pointer forward.

The final token receives a transition to `__END__`, and the message count is
incremented once per non-empty user message.

### Generation

The model:

1. Returns a learning prompt while fewer than three unique vocabulary tokens
   exist.
2. Starts from the last token in the current prompt, or `__START__`.
3. Chooses weighted random next tokens from learned transition counts.
4. Generates at most 32 tokens.
5. Falls back to generating from `__START__` for at most 24 tokens when the
   prompt's last token has no known transition.
6. Formats punctuation without an extra preceding space.

Generation is intentionally stochastic because `Math.random()` is used for
weighted transition selection.

## Snapshot and GitHub synchronization

The GitHub implementation is in
`artifacts/api-server/src/lib/github.ts`.

### Automatic snapshots

`startSnapshotScheduler()` is called after the API begins listening. It starts
an unref'ed five-minute timer that calls `createSnapshot()`. A manual snapshot
can also be created from the **Save now** button in the UI.

Snapshot filenames are timestamped in this form:

```text
bigram-model-YYYY-MM-DDTHH-MM-SS-mmmZ.json
```

Local files are written under:

```text
artifacts/api-server/data/model-snapshots/
```

This directory is runtime data and should not be committed.

### Snapshot JSON shape

Each snapshot includes:

- `format`
- `createdAt`
- `model.vocabulary`
- `model.transitions`
- `model.messageCount`
- `model.learningStartedAt`
- `messages` (empty in current model snapshots; account chat is stored
  separately)
- backup metadata under `github`

The remote copy is written to:

```text
snapshots/<snapshot-filename>.json
```

Each account's chat history is written to:

```text
snapshots/<normalized-username>/chat-history.json
```

The API uses the GitHub Contents API with the `GITHUB_TOKEN` environment
variable:

```ts
const response = await fetch("https://api.github.com/repos/...", {
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  },
});
```

Never hard-code the token. Configure it as a secret in Render.

### Loading the latest remote state

Before every `POST /api/brain/chat`:

1. Read the `snapshots` directory from the private repository.
2. Keep timestamped JSON model files.
3. Select the lexicographically newest filename.
4. Read and base64-decode its GitHub Contents API response.
5. Validate the snapshot shape and dates.
6. Replace the local shared `brain_state` model. Account chat files are not
   mixed into the shared model snapshot.
7. Learn the new message and generate a response from that refreshed state.

If the repository has no snapshots yet, the local state is used. If a remote
snapshot exists but cannot be read or parsed, the chat request fails rather
than silently using potentially stale memory.

## Frontend behavior and routes

The primary UI is in `artifacts/bigram-ai/src/App.tsx`.

Wouter routes:

- `/` — live conversation, model metrics, snapshots, and private-backup status
- `/sources` — open-source project information and link to the imported source
  repository

The app uses the artifact base path from `import.meta.env.BASE_URL`. Keep new
routes compatible with the Wouter router and the artifact's `/` preview path.

The frontend currently provides:

- Disclaimer-first launch flow followed by local account creation/sign-in
- Signed-in username display and sign-out
- Administrator-only control room with AI chat review and account moderation
- Live chat with Enter-to-submit and Shift+Enter for a newline
- Vocabulary, bigram, and message metrics
- Snapshot history
- Manual snapshot creation
- Private GitHub backup status
- Desktop sidebar and mobile menu
- Sources page with the source repository link

The private snapshot repository is intentionally not an anchor or external
link in the Sources page or backup panel.

## Adding a feature safely

For a backend-backed feature:

1. Inspect the existing route and database conventions.
2. Define or update the OpenAPI contract first.
3. Run API code generation.
4. Update the Drizzle schema only when persistence is required.
5. Push the development schema with the DB command if the schema changed.
6. Implement the route using generated Zod validation.
7. Use generated React Query hooks in the frontend.
8. Handle loading, error, empty, and success states.
9. Run `pnpm run typecheck`.
10. Restart the affected service or redeploy.
11. Verify the proxied API and browser preview.

For server code, use the singleton logger from
`artifacts/api-server/src/lib/logger.ts`; do not add `console.log()` calls to
the server.

For frontend code:

- Keep API calls relative and artifact-aware.
- Do not put hooks below conditional returns.
- Invalidate or update affected React Query caches after mutations.
- Keep desktop and mobile navigation in sync.
- Preserve the current visual language in `src/index.css` and `App.tsx`.

## Render deployment

The repository includes `render.yaml` for a single Render web service. The
service builds the frontend and API separately, then runs the Express API as
the production process. Express serves the built frontend and the `/api`
routes from the same origin, so browser cookies and relative API requests work
without a proxy or platform-specific routing.

In Render, set these environment variables:

- `DATABASE_URL` — Render PostgreSQL connection string for the shared model
  cache
- `GITHUB_TOKEN` — fine-grained GitHub token with Contents read/write access
  to `TheFallenStarGG/Bigram-Learning-AI-Snapshots`
- `SESSION_SECRET` — long random secret used to sign account cookies
- `NODE_ENV=production`
- `SERVE_WEB=true`

Before the first launch, apply the Drizzle schema against the Render database:

```bash
pnpm --filter @workspace/db run push
```

The production health check is:

```text
GET /api/healthz
```

Never put credentials or the database connection string in source control.

## Troubleshooting

### `tsc: not found` or `vite: not found`

Dependencies are not installed. Run:

```bash
pnpm install
```

Then restart the local process or redeploy on Render.

### API returns a database relation/table error

Push the development schema:

```bash
pnpm --filter @workspace/db run push
```

Then restart the local process or redeploy on Render.

### API starts but frontend requests fail

Check that:

1. The Render web service is running.
2. The API is available through `/api`.
3. The frontend is using generated relative API paths.
4. You are not hard-coding a localhost URL in browser code.

### GitHub snapshot status is `failed`

Check, without exposing credentials:

1. `GITHUB_TOKEN` is configured in Render and has repository Contents
   read/write permission.
2. The private repository still exists.
3. The configured branch is `main`.
4. The API log contains the GitHub response reason.

The local JSON snapshot and failed status are retained so a remote failure is
visible instead of being reported as a successful backup.

### Blank or incorrect page

Restart the local process or redeploy on Render and check:

- `PORT` is present
- the frontend was built with `BASE_PATH=/`
- the Vite server is bound to `0.0.0.0`
- `SERVE_WEB=true` is set for the production API process

## Important rules

- Keep the existing pnpm workspace structure; do not migrate it to another
  framework or package layout without an explicit product decision.
- Do not replace the PostgreSQL-backed shared model cache without an explicit
  architecture decision. Account records and account chats belong in GitHub,
  not PostgreSQL.
- Do not expose or commit secrets.
- Do not put GitHub tokens in source code or chat. Use `GITHUB_TOKEN` through
  Render's secret manager.
- Do not link the private snapshot repository from the public UI.
- Do not hand-edit generated API clients or Zod files.
- Do not silently fall back to stale model memory after a malformed remote
  snapshot or a GitHub read error.
- Keep `lib/api-spec/openapi.yaml` and generated outputs synchronized.