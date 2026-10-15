-- createdb todo   ثم:   psql -d todo -f schema.sql
CREATE TABLE IF NOT EXISTS tasks (
    id         SERIAL PRIMARY KEY,
    title      VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
    done       BOOLEAN      NOT NULL DEFAULT FALSE,
    category   VARCHAR(20)  NOT NULL DEFAULT '' CHECK (category IN ('', 'work', 'study', 'personal')),
    priority   VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    due_date   DATE,
    position   INTEGER      NOT NULL DEFAULT 0,   -- لترتيب السحب والإفلات
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks (position, id DESC);