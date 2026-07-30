# Project Management Platform — Backend API

A NestJS + PostgreSQL REST API powering a Kanban-style project management platform: user auth, boards, columns and tasks, with drag-and-drop reordering support.

## Tech stack

- **NestJS 10** (TypeScript)
- **PostgreSQL** via **TypeORM**
- **JWT** authentication (Passport)
- **class-validator / class-transformer** for request validation and response shaping
- **Swagger** (OpenAPI) auto-generated docs

## Data model

```
User 1---N Board 1---N BoardColumn 1---N Task
```

- A `User` owns one or more `Board`s.
- Every `Board` is seeded with three default columns on creation: **To Do**, **In Progress**, **Done**.
- Each `Task` belongs to exactly one `BoardColumn` and tracks an `order` used for drag-and-drop positioning.

## Getting started

### 1. Prerequisites

- Node.js 20+
- PostgreSQL running locally, **or** Docker

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if your local Postgres credentials differ from the defaults.

### 3a. Run everything with Docker (API + Postgres)

```bash
docker compose up --build
```

The API will be available at `http://localhost:3000/api`.

### 3b. Run locally against your own Postgres

```bash
npm install
npm run start:dev
```

### 4. Explore the API

Interactive Swagger docs: `http://localhost:3000/api/docs`

## Authentication flow

1. `POST /api/auth/register` — create an account, returns `{ accessToken, user }`.
2. `POST /api/auth/login` — returns `{ accessToken, user }`.
3. Send `Authorization: Bearer <accessToken>` on every subsequent request.
4. `GET /api/auth/me` — returns the currently authenticated user (sanity check for the frontend's protected routes).

Every board/column/task route is protected by a `JwtAuthGuard` and scoped to the authenticated user — a user can only ever see or modify boards they own.

## API reference

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in, get a JWT |
| GET | `/api/auth/me` | Get the current user |
| POST | `/api/boards` | Create a board (auto-seeds To Do / In Progress / Done columns) |
| GET | `/api/boards` | List the current user's boards |
| GET | `/api/boards/:id` | Get one board with its columns and tasks |
| PATCH | `/api/boards/:id` | Update a board |
| DELETE | `/api/boards/:id` | Delete a board |
| POST | `/api/boards/:boardId/columns` | Add a column to a board |
| GET | `/api/boards/:boardId/columns` | List a board's columns |
| PATCH | `/api/boards/:boardId/columns/reorder` | Reorder all columns on a board |
| PATCH | `/api/boards/:boardId/columns/:columnId` | Rename/update a column |
| DELETE | `/api/boards/:boardId/columns/:columnId` | Delete a column |
| POST | `/api/boards/:boardId/columns/:columnId/tasks` | Create a task in a column |
| GET | `/api/boards/:boardId/tasks` | List a board's tasks — supports `search`, `priority`, `status`, `assignedUserId`, `sortBy` query params |
| GET | `/api/tasks/:taskId` | Get one task's full details |
| PATCH | `/api/tasks/:taskId` | Update a task's fields |
| PATCH | `/api/tasks/:taskId/move` | **Drag-and-drop**: move a task to `targetColumnId` at `targetIndex` |
| DELETE | `/api/tasks/:taskId` | Delete a task |
| GET | `/api/users/profile` | Get the current user's profile |
| PATCH | `/api/users/profile` | Update name/email/avatar |
| PATCH | `/api/users/change-password` | Change password (requires current password) |

### Drag-and-drop contract

The frontend Kanban board should call this on every drop:

```
PATCH /api/tasks/:taskId/move
{
  "targetColumnId": "<column the task was dropped into>",
  "targetIndex": 0
}
```

The backend re-sequences `order` for every task in the source and destination columns inside a single transaction, so the frontend can simply re-render using the returned/refetched board state.

## Project structure

```
src/
  auth/        # register/login, JWT strategy, guards, current-user decorator
  users/       # user entity + service (password hashing, lookups)
  boards/      # boards CRUD, ownership checks
  columns/     # columns CRUD, reordering
  tasks/       # tasks CRUD, drag-and-drop move endpoint
  common/      # global exception filter
```

## Notes for production

- Set `DB_SYNCHRONIZE=false` and introduce TypeORM migrations before deploying with real data — `synchronize: true` is for local development only.
- Set a strong, unique `JWT_SECRET`.
- Set `CORS_ORIGIN` to your deployed frontend's exact origin(s).
