require('dotenv').config();
const path = require('path');
const express = require('express');
const { Pool, types } = require('pg');

// أعد أعمدة DATE كنص 'YYYY-MM-DD' بدل كائن Date (لتجنب مشاكل المنطقة الزمنية)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const COLS = 'id, title, done, category, priority, due_date, position, created_at';
const CATEGORIES = ['', 'work', 'study', 'personal'];
const PRIORITIES = ['high', 'medium', 'low'];

/* ---------- Validation ---------- */
function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function validateTask(body, { partial }) {
    const errors = [];
    const data = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: ['Request body must be a JSON object'], data };
    }

    if (!partial || 'title' in body) {
        if (typeof body.title !== 'string' || !body.title.trim()) errors.push('title is required');
        else if (body.title.trim().length > 150) errors.push('title must be at most 150 characters');
        else data.title = body.title.trim();
    }
    if ('done' in body) {
        if (typeof body.done !== 'boolean') errors.push('done must be a boolean');
        else data.done = body.done;
    }
    if ('priority' in body) {
        if (!PRIORITIES.includes(body.priority)) errors.push('priority must be one of: ' + PRIORITIES.join(', '));
        else data.priority = body.priority;
    }
    if ('category' in body) {
        if (!CATEGORIES.includes(body.category)) errors.push('category must be one of: work, study, personal, or empty');
        else data.category = body.category;
    }
    if ('due_date' in body) {
        if (body.due_date === null || body.due_date === '') data.due_date = null;
        else if (typeof body.due_date !== 'string' || !isValidDate(body.due_date))
            errors.push('due_date must be a valid date in YYYY-MM-DD format or null');
        else data.due_date = body.due_date;
    }
    return { errors, data };
}

function parseId(req, res) {
    if (!/^\d{1,9}$/.test(req.params.id)) {
        res.status(400).json({ error: 'Invalid task id' });
        return null;
    }
    return Number(req.params.id);
}

// يلتقط أخطاء async ويمررها لمعالج الأخطاء العام
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* ---------- Routes ---------- */
app.get('/tasks', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${COLS} FROM tasks ORDER BY position ASC, id DESC`);
    res.json(rows);
}));

app.post('/tasks', wrap(async (req, res) => {
    const { errors, data } = validateTask(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    // المهمة الجديدة تظهر في الأعلى
    const { rows } = await pool.query(
        `INSERT INTO tasks (title, done, category, priority, due_date, position)
         VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MIN(position) FROM tasks), 0) - 1)
         RETURNING ${COLS}`,
        [data.title, data.done ?? false, data.category ?? '', data.priority ?? 'medium', data.due_date ?? null]
    );
    res.status(201).json(rows[0]);
}));

// يجب تعريفه قبل /tasks/:id
app.put('/tasks/reorder', wrap(async (req, res) => {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length > 5000 || !ids.every((n) => Number.isInteger(n) && n > 0)) {
        return res.status(400).json({ error: 'Validation failed', details: ['ids must be an array of positive integers'] });
    }
    await pool.query(
        `UPDATE tasks SET position = v.pos
         FROM unnest($1::int[]) WITH ORDINALITY AS v(id, pos)
         WHERE tasks.id = v.id`,
        [ids]
    );
    res.status(204).end();
}));

app.put('/tasks/:id', wrap(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { errors, data } = validateTask(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const keys = Object.keys(data); // مفاتيح من قائمة بيضاء داخل validateTask فقط
    if (!keys.length) return res.status(400).json({ error: 'Validation failed', details: ['No updatable fields provided'] });

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
        `UPDATE tasks SET ${sets} WHERE id = $${keys.length + 1} RETURNING ${COLS}`,
        [...keys.map((k) => data[k]), id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
}));

app.delete('/tasks/:id', wrap(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
}));

/* ---------- Errors ---------- */
app.use('/tasks', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));