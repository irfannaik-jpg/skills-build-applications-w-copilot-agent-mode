# OctoFit Tracker architecture

OctoFit Tracker is a three-tier application for a school fitness program. The starter code includes API contracts and intentionally incomplete implementation points so you can use GitHub Copilot agent mode in a test-driven loop.

![Three-tier OctoFit architecture](../.github/images/octofit-architecture.svg)

## Tier boundaries

- **Presentation tier**: React 19, Vite, React Router, Bootstrap, and a shared API client in `octofit-tracker/frontend/src`.
- **Logic tier**: Express and TypeScript routes/services in `octofit-tracker/backend/src` expose `/api/*` behavior on port `8000`.
- **Data tier**: Mongoose models and seed data in `octofit-tracker/backend/src/models` and `src/scripts/seed.ts` persist to MongoDB on port `27017`.

## Ports and environment rules

- MongoDB: `27017`
- Express API: `8000`
- Vite frontend: `5173`
- The browser calls relative `/api` paths. Vite proxies them to `http://localhost:8000`, so the unauthenticated API port stays private in Codespaces. `VITE_API_BASE_URL` can override the base URL.

## API contract

| Capability | Method and path | Expected behavior |
| --- | --- | --- |
| Activity tracking | `GET /api/activities`, `POST /api/activities` | List and create valid activity records. POST accepts `userId`, `teamId`, `type`, and `minutes`; `userId` and `teamId` must be well-formed IDs for an existing user and team; otherwise respond with a deliberate 4xx (never a 500 from a cast error). A created activity stores the submitted `user`, `team`, `type`, and `minutes` plus computed `points` and `occurredAt`. |
| Teams | `GET /api/teams`, `POST /api/teams` | List and create teams with members. Created and listed teams keep the submitted `name` and `mascot`. Reject a team without a name with `400`. |
| Leaderboard | `GET /api/leaderboard` | Return teams ordered by the sum of their activity points, highest first. Each entry has `teamName`, `totalPoints`, and a 1-based `rank`. |
| Workout suggestions | `GET /api/workouts/suggestions/:userEmail` | Recommend workouts from recent activity patterns for the matching seeded user's email address. The first suggestion's `focus` matches that user's goal or recent activity, with a `reason` explaining why. An email with no matching user returns a deliberate 4xx (for example, `404`). |

## Implementation decisions

Record your plan here before editing code.

- Presentation tier decision: Keep rendering and user interaction in React route components; use the shared API client for relative `/api` requests. Each capability view should expose accessible loading, empty, and error states.
- Logic tier decision: Keep request validation and business rules in Express routes/services. Validate ObjectId syntax and referenced records before writes, and return deliberate 4xx responses for invalid or unknown input.
- Data tier decision: Define required fields, references, defaults, and validation in the Mongoose models. Seed representative users, teams, activities, and workouts idempotently without deleting or overwriting unrelated records.
- Activity tracking approach: Validate `userId` and `teamId`, create an activity linked to existing records, derive points from the submitted activity, and set `occurredAt` when creating the record. List persisted activities from the API.
- Team management approach: Require a name, retain the submitted name and mascot, and persist the members array with an empty-array default.
- Leaderboard approach: Aggregate persisted activity points by team, sort totals descending, and return the team name, total, and 1-based rank.
- Workout suggestions approach: Find the requested user by email, use their fitness goal and recent activity to prioritize matching workouts, and explain the first recommendation with a reason. Return 4xx when no user matches.
- Smallest safe implementation order: (1) implement and test the Mongoose schemas and idempotent seed data; (2) implement API behavior, starting with activities and teams, then leaderboard and workout suggestions; (3) implement the shared frontend API integration and capability views/states; (4) run both builds. Keep each step focused and verify its tier before moving on.

## Test plan

Run focused contract tests in dependency order, then run both builds to catch type and bundling errors. The test suites use an in-memory MongoDB for data and API coverage; MongoDB binary download/startup failures are environmental and do not establish whether those assertions pass.

- Data-tier command: `npm run test:data --prefix octofit-tracker/backend` — verifies required model fields/defaults and repeatable seeding that preserves unrelated records. Schema assertion failures indicate model-contract gaps; seed assertions indicate missing, mislinked, destructive, or non-idempotent fixtures.
- API command: `npm run test:api --prefix octofit-tracker/backend` — verifies activity/team creation and listing, input/reference validation, leaderboard ordering/ranks, and user-specific workout recommendations. Assertion failures indicate route/service contract gaps; a MongoDB memory-server startup failure means the suite was blocked before API behavior could be tested.
- Frontend command: `npm test --prefix octofit-tracker/frontend` — verifies capability data rendering, user-specific suggestion requests, and accessible loading, empty, and error states. Failures identify missing or incorrect frontend integration or presentation behavior.
- Backend build command: `npm run build --prefix octofit-tracker/backend` — verifies TypeScript compilation; failures indicate backend type errors.
- Frontend build command: `npm run build --prefix octofit-tracker/frontend` — verifies TypeScript compilation and Vite bundling; failures indicate frontend type or build errors.

Current baseline: model validation assertions and all frontend contract tests fail against the starter implementation. The seed and API suites could not be fully evaluated because `mongodb-memory-server` could not download its MongoDB binary in this environment.
