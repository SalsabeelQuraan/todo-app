# My Tasks — To-Do List

A clean, fast to-do web app built with **vanilla HTML/CSS/JavaScript** on the front end and a **Node.js + Express + PostgreSQL** REST API on the back end.

## Features

- Add, edit, complete, and delete tasks
- Categories (Work, Study, Personal) and priorities (High, Medium, Low)
- Due dates with "Due today" and "Overdue" indicators
- Live search, status filters (All / Active / Completed), and category filter
- Drag & drop reordering, saved to the database
- Undo for deleted tasks (single task or "clear completed")
- Light / dark theme (follows system preference, remembered per browser)
- Summary counters: total, completed, remaining
- Server-side validation and consistent JSON error responses
- XSS-safe rendering (`textContent` instead of `innerHTML` for user data)

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | HTML, CSS, vanilla JavaScript       |
| Backend  | Node.js, Express 4                  |
| Database | PostgreSQL (via `pg`)               |
| Config   | `dotenv`                            |

## Project Structure

```
todo-app/
├── public/
│   ├── index.html      # UI and styles
│   └── script.js       # Frontend logic (talks to the API with fetch)
├── server.js           # Express server and REST API
├── schema.sql          # Database schema
├── package.json
├── .env.example        # Environment variables template
└── .gitignore
```

> The server serves static files from the `public/` folder, so `index.html` and `script.js` must live there.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [PostgreSQL](https://www.postgresql.org/) 12 or newer

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/todo-app.git
cd todo-app
npm install
```

### 2. Create the database

```bash
createdb todo
psql -d todo -f schema.sql
```

### 3. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/todo
PORT=3000
```

### 4. Run

```bash
npm start        # production
npm run dev      # auto-restart on file changes (Node 18.11+)
```

Open <http://localhost:3000>.

## API Reference

Base URL: `http://localhost:3000`

| Method | Endpoint         | Description                            | Success |
| ------ | ---------------- | -------------------------------------- | ------- |
| GET    | `/tasks`         | List all tasks (ordered by position)   | `200`   |
| POST   | `/tasks`         | Create a task (added to the top)       | `201`   |
| PUT    | `/tasks/:id`     | Update one or more fields of a task    | `200`   |
| PUT    | `/tasks/reorder` | Save a new order from an array of ids  | `204`   |
| DELETE | `/tasks/:id`     | Delete a task                          | `204`   |

### Task object

```json
{
  "id": 1,
  "title": "Finish the report",
  "done": false,
  "category": "work",
  "priority": "high",
  "due_date": "2026-10-20",
  "position": -1,
  "created_at": "2026-10-15T10:30:00.000Z"
}
```

### Field rules

| Field      | Type    | Rules                                                |
| ---------- | ------- | ---------------------------------------------------- |
| `title`    | string  | Required on create, 1–150 characters (trimmed)       |
| `done`     | boolean | Optional, defaults to `false`                        |
| `category` | string  | `""`, `work`, `study`, or `personal`                 |
| `priority` | string  | `high`, `medium` (default), or `low`                 |
| `due_date` | string  | `YYYY-MM-DD` (valid calendar date) or `null`         |

### Examples

```bash
# Create
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Read a book","category":"personal","priority":"low"}'

# Mark as done
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# Reorder
curl -X PUT http://localhost:3000/tasks/reorder \
  -H "Content-Type: application/json" \
  -d '{"ids":[3,1,2]}'

# Delete
curl -X DELETE http://localhost:3000/tasks/1
```

### Errors

Errors are returned as JSON with an appropriate status code:

```json
{ "error": "Validation failed", "details": ["title is required"] }
```

| Status | Meaning                                   |
| ------ | ----------------------------------------- |
| `400`  | Validation error, invalid id, or bad JSON |
| `404`  | Task or route not found                   |
| `413`  | Request body larger than 10 KB            |
| `500`  | Internal server error                     |

## Security Notes

- All SQL uses parameterized queries; dynamic column names in updates come only from a validated whitelist.
- Request bodies are limited to 10 KB.
- `.env` is git-ignored — never commit real credentials.

## License

Add a license of your choice (for example [MIT](https://choosealicense.com/licenses/mit/)).
