(function () {
    'use strict';

    var API = '/tasks',
        THEME_KEY = 'todo.theme';
    var CATS = { work: 'Work', study: 'Study', personal: 'Personal' };
    var PRIS = { high: 'High', medium: 'Medium', low: 'Low' };

    var tasks = [];
    var loading = true;
    var filter = 'all',
        query = '',
        catFilter = 'all';
    var editingId = null,
        dragId = null,
        lastDeleted = null,
        toastTimer = null;

    var $ = function (id) {
        return document.getElementById(id);
    };
    var form = $('taskForm'),
        input = $('taskInput'),
        list = $('taskList');
    var emptyState = $('emptyState'),
        clearBtn = $('clearCompletedBtn');

    var ICON_CHECK =
        '<svg fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
    var ICON_EDIT =
        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.6a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.8z"/></svg>';
    var ICON_DEL =
        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';

    /* ---------- API ---------- */
    async function api(method, path, body) {
        var opts = { method: method, headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        var res = await fetch(API + path, opts);
        if (res.status === 204) return null;
        var data = null;
        try {
            data = await res.json();
        } catch (e) {}
        if (!res.ok) {
            var msg = data && (data.details ? data.details.join(', ') : data.error);
            throw new Error(msg || 'Request failed (' + res.status + ')');
        }
        return data;
    }
    function fromApi(r) {
        return {
            id: r.id,
            title: r.title,
            done: !!r.done,
            category: r.category || '',
            priority: r.priority,
            due: r.due_date || '',
        };
    }
    function toApi(d) {
        var o = {};
        if ('title' in d) o.title = d.title;
        if ('done' in d) o.done = d.done;
        if ('category' in d) o.category = d.category;
        if ('priority' in d) o.priority = d.priority;
        if ('due' in d) o.due_date = d.due || null;
        return o;
    }
    function fail(e) {
        showToast(e && e.message ? e.message : 'Something went wrong', false);
    }
    async function loadTasks() {
        try {
            var rows = await api('GET', '');
            tasks = rows.map(fromApi);
        } catch (e) {
            fail(e);
        }
        loading = false;
        render();
    }
    function persistOrder() {
        return api('PUT', '/reorder', {
            ids: tasks.map(function (t) {
                return t.id;
            }),
        });
    }

    /* ---------- Helpers ---------- */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text; // textContent = safe from XSS
        return n;
    }
    function pad(n) {
        return (n < 10 ? '0' : '') + n;
    }
    function todayStr() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function fmtDate(s) {
        return new Date(s + 'T00:00:00').toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
    function indexOf(id) {
        for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return i;
        return -1;
    }
    function isOverdue(t) {
        return !t.done && t.due && t.due < todayStr();
    }
    function makeSelect(map, value, emptyLabel) {
        var s = el('select', 'edit-select');
        if (emptyLabel) {
            var o = el('option', '', emptyLabel);
            o.value = '';
            s.appendChild(o);
        }
        Object.keys(map).forEach(function (k) {
            var o2 = el('option', '', map[k]);
            o2.value = k;
            s.appendChild(o2);
        });
        s.value = value;
        return s;
    }
    function chip(cls, text) {
        return el('span', 'chip ' + cls, text);
    }

    /* ---------- Actions ---------- */
    async function addTask(data) {
        try {
            var created = await api('POST', '', toApi(data));
            tasks.unshift(fromApi(created));
            render();
            return true;
        } catch (e) {
            fail(e);
            return false;
        }
    }
    async function toggleTask(id) {
        var i = indexOf(id);
        if (i < 0) return;
        try {
            var updated = await api('PUT', '/' + id, { done: !tasks[i].done });
            tasks[i] = fromApi(updated);
            render();
        } catch (e) {
            fail(e);
        }
    }
    async function updateTask(id, data) {
        var i = indexOf(id);
        if (i < 0) return;
        try {
            var updated = await api('PUT', '/' + id, toApi(data));
            tasks[i] = fromApi(updated);
            editingId = null;
            render();
        } catch (e) {
            fail(e); // نبقى في وضع التعديل ليصحح المستخدم المدخلات
        }
    }
    async function deleteTask(id) {
        var i = indexOf(id);
        if (i < 0) return;
        try {
            await api('DELETE', '/' + id);
            lastDeleted = [{ task: tasks.splice(i, 1)[0], index: i }];
            if (editingId === id) editingId = null;
            render();
            showToast('Task deleted', true);
        } catch (e) {
            fail(e);
        }
    }
    async function clearCompleted() {
        var doneTasks = [];
        tasks.forEach(function (t, i) {
            if (t.done) doneTasks.push({ task: t, index: i });
        });
        if (!doneTasks.length) return;
        var removed = [];
        try {
            for (var k = 0; k < doneTasks.length; k++) {
                await api('DELETE', '/' + doneTasks[k].task.id);
                removed.push(doneTasks[k]);
            }
        } catch (e) {
            fail(e);
        }
        if (!removed.length) return;
        var gone = {};
        removed.forEach(function (r) {
            gone[r.task.id] = true;
        });
        tasks = tasks.filter(function (t) {
            return !gone[t.id];
        });
        lastDeleted = removed;
        render();
        showToast(removed.length + ' completed task(s) deleted', true);
    }
    async function undo() {
        if (!lastDeleted) return;
        var items = lastDeleted.sort(function (a, b) {
            return a.index - b.index;
        });
        lastDeleted = null;
        hideToast();
        try {
            for (var k = 0; k < items.length; k++) {
                // المهمة المحذوفة تُنشأ من جديد (id جديد) ثم تعاد لمكانها
                var created = fromApi(await api('POST', '', toApi(items[k].task)));
                tasks.splice(Math.min(items[k].index, tasks.length), 0, created);
            }
            render();
            await persistOrder();
        } catch (e) {
            fail(e);
            loadTasks();
        }
    }
    async function moveTask(fromId, toId) {
        var from = indexOf(fromId),
            to = indexOf(toId);
        if (from < 0 || to < 0 || from === to) return;
        tasks.splice(to, 0, tasks.splice(from, 1)[0]);
        render();
        try {
            await persistOrder();
        } catch (e) {
            fail(e);
            loadTasks();
        }
    }

    /* ---------- Toast (Undo) ---------- */
    function showToast(msg, withUndo) {
        $('toastMsg').textContent = msg;
        $('undoBtn').style.display = withUndo ? '' : 'none';
        $('toast').classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            hideToast();
            lastDeleted = null;
        }, 6000);
    }
    function hideToast() {
        clearTimeout(toastTimer);
        $('toast').classList.remove('show');
    }

    /* ---------- Rendering ---------- */
    function buildItem(t) {
        var li = el('li', 'task-item' + (t.done ? ' completed' : '') + (isOverdue(t) ? ' overdue' : ''));

        // Edit mode
        if (editingId === t.id) {
            var wrap = el('div', 'edit-task-wrapper');
            var inp = el('input', 'edit-input');
            inp.type = 'text';
            inp.value = t.title;
            inp.maxLength = 150;
            inp.setAttribute('aria-label', 'Edit task title');
            var catSel = makeSelect(CATS, t.category, 'No category');
            var priSel = makeSelect(PRIS, t.priority);
            var dueInp = el('input', 'edit-select');
            dueInp.type = 'date';
            dueInp.value = t.due;
            var saveBtn = el('button', 'btn-save', 'Save');
            saveBtn.type = 'button';
            var cancelBtn = el('button', 'btn-cancel', 'Cancel');
            cancelBtn.type = 'button';

            var commit = function () {
                var v = inp.value.trim();
                if (!v) {
                    inp.focus();
                    return;
                }
                updateTask(t.id, { title: v, category: catSel.value, priority: priSel.value, due: dueInp.value });
            };
            saveBtn.addEventListener('click', commit);
            cancelBtn.addEventListener('click', function () {
                editingId = null;
                render();
            });
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                } else if (e.key === 'Escape') {
                    editingId = null;
                    render();
                }
            });

            wrap.append(inp, catSel, priSel, dueInp, saveBtn, cancelBtn);
            li.appendChild(wrap);
            setTimeout(function () {
                inp.focus();
                inp.select();
            }, 0);
            return li;
        }

        // Normal mode
        var left = el('div', 'task-left');
        var cb = el('button', 'custom-checkbox' + (t.done ? ' checked' : ''));
        cb.type = 'button';
        cb.setAttribute('role', 'checkbox');
        cb.setAttribute('aria-checked', String(t.done));
        cb.setAttribute('aria-label', 'Mark task as ' + (t.done ? 'not completed' : 'completed'));
        cb.innerHTML = ICON_CHECK;
        cb.addEventListener('click', function () {
            toggleTask(t.id);
        });

        var main = el('div', 'task-main');
        main.appendChild(el('span', 'task-title', t.title));
        var meta = el('div', 'task-meta');
        meta.appendChild(chip('pri-' + t.priority, PRIS[t.priority]));
        if (t.category) meta.appendChild(chip('cat-' + t.category, CATS[t.category]));
        if (t.due) {
            var label = t.due === todayStr() ? 'Due today' : (isOverdue(t) ? 'Overdue ' : 'Due ') + fmtDate(t.due);
            meta.appendChild(chip('due' + (isOverdue(t) ? ' overdue' : ''), label));
        }
        main.appendChild(meta);
        left.append(el('span', 'drag-handle', '\u22EE\u22EE'), cb, main);

        var actions = el('div', 'task-actions');
        var edit = el('button', 'action-btn edit-btn');
        edit.type = 'button';
        edit.setAttribute('aria-label', 'Edit task');
        edit.innerHTML = ICON_EDIT;
        edit.addEventListener('click', function () {
            editingId = t.id;
            render();
        });
        var del = el('button', 'action-btn delete-btn');
        del.type = 'button';
        del.setAttribute('aria-label', 'Delete task');
        del.innerHTML = ICON_DEL;
        del.addEventListener('click', function () {
            deleteTask(t.id);
        });
        actions.append(edit, del);

        // Drag & drop reordering
        li.draggable = true;
        li.addEventListener('dragstart', function (e) {
            dragId = t.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(t.id));
            li.classList.add('dragging');
        });
        li.addEventListener('dragover', function (e) {
            if (!dragId || dragId === t.id) return;
            e.preventDefault();
            li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', function () {
            li.classList.remove('drag-over');
        });
        li.addEventListener('drop', function (e) {
            e.preventDefault();
            var from = dragId;
            dragId = null;
            if (from) moveTask(from, t.id);
        });
        li.addEventListener('dragend', function () {
            dragId = null;
            render();
        });

        li.append(left, actions);
        return li;
    }

    function render() {
        var total = tasks.length;
        var done = tasks.filter(function (t) {
            return t.done;
        }).length;
        $('totalCount').textContent = total;
        $('completedCount').textContent = done;
        $('remainingCount').textContent = total - done;
        clearBtn.disabled = done === 0;

        var q = query.trim().toLowerCase();
        var visible = tasks.filter(function (t) {
            if (filter === 'active' && t.done) return false;
            if (filter === 'completed' && !t.done) return false;
            if (catFilter !== 'all' && t.category !== catFilter) return false;
            return !q || t.title.toLowerCase().indexOf(q) !== -1;
        });

        list.textContent = '';
        visible.forEach(function (t) {
            list.appendChild(buildItem(t));
        });

        var labels = { all: 'Showing all tasks', active: 'Showing active tasks', completed: 'Showing completed tasks' };
        $('filterStatusInfo').textContent = labels[filter] + ' (' + visible.length + ')';

        if (visible.length === 0) {
            var msg;
            if (loading) {
                msg = ['Loading...', 'Fetching your tasks from the server.'];
            } else if (q || catFilter !== 'all') {
                msg = ['No matching tasks', 'Try a different search or category.'];
            } else {
                msg = {
                    all: ['No tasks yet!', 'Start by adding your first task.'],
                    active: ['Nothing left to do!', 'All your tasks are completed.'],
                    completed: ['No completed tasks', 'Finish a task and it will show up here.'],
                }[filter];
            }
            $('emptyTitle').textContent = msg[0];
            $('emptyDesc').textContent = msg[1];
            emptyState.style.display = '';
        } else {
            emptyState.style.display = 'none';
        }
    }

    /* ---------- Events ---------- */
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (!v) {
            input.classList.add('invalid');
            input.focus();
            return;
        }
        input.classList.remove('invalid');
        var ok = await addTask({
            title: v,
            category: $('taskCategory').value,
            priority: $('taskPriority').value,
            due: $('taskDue').value,
        });
        if (ok) {
            input.value = '';
            $('taskDue').value = '';
        }
        input.focus();
    });
    input.addEventListener('input', function () {
        input.classList.remove('invalid');
    });

    $('searchInput').addEventListener('input', function (e) {
        query = e.target.value;
        render();
    });
    $('categoryFilter').addEventListener('change', function (e) {
        catFilter = e.target.value;
        render();
    });

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            filter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(function (b) {
                var on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            editingId = null;
            render();
        });
    });

    clearBtn.addEventListener('click', clearCompleted);
    $('undoBtn').addEventListener('click', undo);

    $('themeBtn').addEventListener('click', function () {
        var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch (e) {}
    });

    render();
    loadTasks();
})();