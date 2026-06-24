'use strict';

// ---------- Состояние ----------
const state = {
  schemas: [],
  activeSchemaId: null,
  trees: [],
  activeTreeId: null,
  nodes: [],          // плоский список
  selectedNodeId: null,
  fields: [],         // schema_fields активной схемы
};

// ---------- API ----------
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* пусто */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Ошибка ${res.status}`);
  }
  return data;
}

// ---------- Утилиты ----------
const $ = (sel) => document.querySelector(sel);

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

function handleError(err) {
  console.error(err);
  toast(err.message || 'Произошла ошибка', true);
}

// ---------- Загрузка данных ----------
async function loadSchemas() {
  state.schemas = await api('GET', '/schemas');
}

async function loadTrees() {
  state.trees = await api('GET', '/trees');
}

async function loadFields() {
  if (!state.activeSchemaId) { state.fields = []; return; }
  state.fields = await api('GET', `/schemas/${state.activeSchemaId}/fields`);
}

async function loadNodes() {
  if (!state.activeTreeId) { state.nodes = []; return; }
  state.nodes = await api('GET', `/trees/${state.activeTreeId}/nodes`);
}

// При выборе дерева подтягиваем его схему как активную
function syncActiveSchemaFromTree() {
  const tree = state.trees.find((t) => t.id === state.activeTreeId);
  state.activeSchemaId = tree ? tree.schema_id : null;
}

async function selectTree(treeId) {
  state.activeTreeId = treeId;
  state.selectedNodeId = null;
  syncActiveSchemaFromTree();
  await Promise.all([loadFields(), loadNodes()]);
  renderAll();
}

// ---------- Рендер: navbar ----------
function renderTreeSelect() {
  const sel = $('#tree-select');
  sel.innerHTML = '';
  if (state.trees.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '— нет деревьев —';
    opt.value = '';
    sel.appendChild(opt);
  }
  state.trees.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    if (t.id === state.activeTreeId) opt.selected = true;
    sel.appendChild(opt);
  });

  const tree = state.trees.find((t) => t.id === state.activeTreeId);
  $('#active-schema-label').textContent = tree
    ? `Схема: ${tree.schema_name || '#' + tree.schema_id}`
    : '';
  $('#delete-tree-btn').style.display = tree ? '' : 'none';
}

// ---------- Рендер: левая панель (схема полей) ----------
function renderFields() {
  const info = $('#schema-info');
  const list = $('#fields-list');
  const addBtn = $('#add-field-btn');
  list.innerHTML = '';

  if (!state.activeSchemaId) {
    info.textContent = 'Схема не выбрана';
    addBtn.classList.add('hidden');
    return;
  }
  const schema = state.schemas.find((s) => s.id === state.activeSchemaId);
  info.textContent = schema ? `Схема: ${schema.name}` : `Схема #${state.activeSchemaId}`;
  addBtn.classList.remove('hidden');

  if (state.fields.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Полей пока нет';
    list.appendChild(li);
    return;
  }

  state.fields.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'field-item';
    li.draggable = true;
    li.dataset.id = f.id;

    const meta = [f.field_type];
    li.innerHTML = `
      <div class="field-item-head">
        <span class="field-item-label">${escapeHtml(f.label)} ${f.required ? '<span class="req-badge">*</span>' : ''}</span>
        <span class="field-item-actions">
          <button class="icon-btn" data-act="edit" title="Редактировать">✎</button>
          <button class="icon-btn" data-act="del" title="Удалить">🗑</button>
        </span>
      </div>
      <div class="field-item-meta">${escapeHtml(meta.join(' · '))}</div>
    `;

    li.querySelector('[data-act="edit"]').addEventListener('click', () => openFieldForm(f));
    li.querySelector('[data-act="del"]').addEventListener('click', () => deleteField(f));

    addDragHandlers(li);
    list.appendChild(li);
  });
}

// drag-and-drop для переупорядочивания полей
let dragSrcId = null;
function addDragHandlers(li) {
  li.addEventListener('dragstart', (e) => {
    dragSrcId = Number(li.dataset.id);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('.field-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const targetId = Number(li.dataset.id);
    if (dragSrcId && dragSrcId !== targetId) reorderFields(dragSrcId, targetId);
  });
}

async function reorderFields(srcId, targetId) {
  const ids = state.fields.map((f) => f.id);
  const from = ids.indexOf(srcId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);

  try {
    // переназначаем position по новому порядку
    await Promise.all(
      ids.map((id, idx) => api('PUT', `/schema-fields/${id}`, { position: idx }))
    );
    await loadFields();
    renderFields();
  } catch (err) {
    handleError(err);
  }
}

// ---------- Inline-форма поля ----------
function openFieldForm(field) {
  const form = $('#field-form');
  form.classList.remove('hidden');
  $('#field-id').value = field ? field.id : '';
  $('#field-key').value = field ? field.key : '';
  $('#field-type').value = field ? field.field_type : 'text';
  $('#field-options').value = field && Array.isArray(field.options) ? field.options.join(', ') : '';
  toggleOptionsField();
  $('#field-key').focus();
}

function closeFieldForm() {
  $('#field-form').classList.add('hidden');
  $('#field-form').reset();
  $('#field-id').value = '';
}

function toggleOptionsField() {
  const isSelect = $('#field-type').value === 'select';
  $('#field-options-wrap').classList.toggle('hidden', !isSelect);
}

async function submitFieldForm(e) {
  e.preventDefault();
  const id = $('#field-id').value;
  const type = $('#field-type').value;
  const optionsRaw = $('#field-options').value.trim();
  const options =
    type === 'select' && optionsRaw
      ? optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

  const key = $('#field-key').value.trim();
  const payload = {
    key,
    label: key,        // метка совпадает с ключом
    field_type: type,
    required: false,   // все поля необязательные
    options,
  };

  try {
    if (id) {
      await api('PUT', `/schema-fields/${id}`, payload);
    } else {
      await api('POST', `/schemas/${state.activeSchemaId}/fields`, payload);
    }
    closeFieldForm();
    await loadFields();
    renderFields();
    renderDiagram();   // узлы показывают поля схемы
    if (state.selectedNodeId) renderNodeEditor();
    toast('Поле сохранено');
  } catch (err) {
    handleError(err);
  }
}

async function deleteField(field) {
  try {
    await api('DELETE', `/schema-fields/${field.id}`);
    await loadFields();
    renderFields();
    renderDiagram();
    if (state.selectedNodeId) renderNodeEditor();
    toast('Поле удалено');
  } catch (err) {
    handleError(err);
  }
}

// ---------- Рендер: диаграмма ----------
function buildTree(nodes) {
  const byId = new Map();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots = [];
  byId.forEach((n) => {
    if (n.parent_id != null && byId.has(n.parent_id)) {
      byId.get(n.parent_id).children.push(n);
    } else {
      roots.push(n);
    }
  });
  const sortRec = (arr) => {
    arr.sort((a, b) => a.position - b.position || a.id - b.id);
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// какие поля показывать на карточке узла (приоритет name, затем по порядку)
function previewFields() {
  const fields = [...state.fields];
  fields.sort((a, b) => {
    const an = a.key === 'name' ? -1 : 0;
    const bn = b.key === 'name' ? -1 : 0;
    return an - bn || a.position - b.position;
  });
  return fields.slice(0, 3);
}

function nodeBoxHtml(node) {
  const preview = previewFields();
  let inner = '';
  if (preview.length === 0) {
    inner = `<div class="node-empty">узел #${node.id}</div>`;
  } else {
    preview.forEach((f, idx) => {
      const val = node.data && node.data[f.key] != null && node.data[f.key] !== ''
        ? String(node.data[f.key]) : '';
      if (idx === 0) {
        inner += `<div class="node-title">${val ? escapeHtml(val) : '<span class="node-empty">без значения</span>'}</div>`;
      } else if (val) {
        inner += `<div class="node-line">${escapeHtml(f.label)}: ${escapeHtml(val)}</div>`;
      }
    });
  }
  const selected = node.id === state.selectedNodeId ? ' selected' : '';
  return `<div class="node-box${selected}" data-id="${node.id}">
    ${inner}
    <button class="node-add-child" data-id="${node.id}" title="Добавить дочерний">+</button>
  </div>`;
}

function renderTreeHtml(nodes) {
  if (nodes.length === 0) return '';
  let html = '<ul class="tree">';
  nodes.forEach((n) => {
    html += '<li>';
    html += nodeBoxHtml(n);
    if (n.children.length) html += renderTreeHtml(n.children);
    html += '</li>';
  });
  html += '</ul>';
  return html;
}

function renderDiagram() {
  const container = $('#diagram');
  container.innerHTML = '';

  if (!state.activeTreeId) {
    container.innerHTML = '<div class="empty-state">Выберите или создайте дерево</div>';
    return;
  }

  const roots = buildTree(state.nodes);

  if (roots.length === 0) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = '<p>Дерево пустое</p>';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '+ Добавить корень';
    btn.addEventListener('click', () => createNode(null));
    wrap.appendChild(btn);
    container.appendChild(wrap);
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'diagram-inner';
  inner.innerHTML = renderTreeHtml(roots);
  container.appendChild(inner);

  // кнопка "добавить корень" снизу
  const addRoot = document.createElement('div');
  addRoot.style.textAlign = 'center';
  addRoot.style.marginTop = '24px';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = '+ Добавить корень';
  btn.addEventListener('click', () => createNode(null));
  addRoot.appendChild(btn);
  inner.appendChild(addRoot);

  // обработчики
  container.querySelectorAll('.node-box').forEach((box) => {
    box.addEventListener('click', (e) => {
      if (e.target.classList.contains('node-add-child')) return;
      selectNode(Number(box.dataset.id));
    });
  });
  container.querySelectorAll('.node-add-child').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      createNode(Number(b.dataset.id));
    });
  });
}

// ---------- Узлы ----------
function selectNode(id) {
  state.selectedNodeId = id;
  renderDiagram();
  renderNodeEditor();
}

async function createNode(parentId) {
  if (!state.activeTreeId) return;
  // создаём с пустыми/дефолтными данными
  const data = {};
  try {
    const node = await api('POST', '/nodes', {
      tree_id: state.activeTreeId,
      parent_id: parentId,
      data,
    });
    await loadNodes();
    state.selectedNodeId = node.id;
    renderDiagram();
    renderNodeEditor();
    toast('Узел создан');
  } catch (err) {
    handleError(err);
  }
}

function renderNodeEditor() {
  const editor = $('#node-editor');
  editor.innerHTML = '';

  const node = state.nodes.find((n) => n.id === state.selectedNodeId);
  if (!node) {
    editor.innerHTML = '<p class="muted">Выберите узел в диаграмме</p>';
    return;
  }

  if (state.fields.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'У схемы нет полей. Добавьте поля слева.';
    editor.appendChild(p);
  }

  const inputs = {};
  state.fields.forEach((f) => {
    const label = document.createElement('label');
    label.textContent = f.label + (f.required ? ' *' : '');

    let input;
    if (f.field_type === 'select') {
      input = document.createElement('select');
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      input.appendChild(empty);
      (Array.isArray(f.options) ? f.options : []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = f.field_type === 'number' ? 'number'
        : f.field_type === 'date' ? 'date' : 'text';
    }
    const val = node.data ? node.data[f.key] : undefined;
    if (val != null) input.value = val;

    label.appendChild(input);
    editor.appendChild(label);
    inputs[f.key] = { input, field: f };
  });

  // кнопки
  const actions = document.createElement('div');
  actions.className = 'editor-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Сохранить';
  saveBtn.addEventListener('click', () => saveNode(node, inputs));

  const childBtn = document.createElement('button');
  childBtn.className = 'btn';
  childBtn.textContent = '+ Дочерний узел';
  childBtn.addEventListener('click', () => createNode(node.id));

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-danger';
  delBtn.textContent = 'Удалить узел';
  delBtn.addEventListener('click', () => deleteNode(node));

  actions.appendChild(saveBtn);
  actions.appendChild(childBtn);
  actions.appendChild(delBtn);
  editor.appendChild(actions);
}

async function saveNode(node, inputs) {
  const data = { ...node.data };
  // проверка required
  for (const key in inputs) {
    const { input, field } = inputs[key];
    const v = input.value;
    if (field.required && (!v || !String(v).trim())) {
      toast(`Поле «${field.label}» обязательно`, true);
      input.focus();
      return;
    }
    data[key] = v;
  }
  try {
    await api('PUT', `/nodes/${node.id}`, { data });
    await loadNodes();
    renderDiagram();
    renderNodeEditor();
    toast('Узел сохранён');
  } catch (err) {
    handleError(err);
  }
}

async function deleteNode(node) {
  try {
    await api('DELETE', `/nodes/${node.id}`);
    state.selectedNodeId = null;
    await loadNodes();
    renderDiagram();
    renderNodeEditor();
    toast('Узел удалён');
  } catch (err) {
    handleError(err);
  }
}

// ---------- Деревья: модалка ----------
function openTreeModal() {
  const sel = $('#tree-schema-select');
  sel.innerHTML = '';
  if (state.schemas.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— нет схем, создайте новую ниже —';
    sel.appendChild(opt);
  }
  state.schemas.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  $('#tree-title').value = '';
  $('#new-schema-name').value = '';
  $('#tree-modal').classList.remove('hidden');
  $('#tree-title').focus();
}

function closeTreeModal() {
  $('#tree-modal').classList.add('hidden');
}

async function submitTreeForm(e) {
  e.preventDefault();
  const title = $('#tree-title').value.trim();
  const newSchemaName = $('#new-schema-name').value.trim();
  let schemaId = $('#tree-schema-select').value;

  if (!title) { toast('Введите название дерева', true); return; }

  try {
    if (newSchemaName) {
      const schema = await api('POST', '/schemas', { name: newSchemaName });
      await loadSchemas();
      schemaId = schema.id;
    }
    if (!schemaId) { toast('Выберите или создайте схему', true); return; }

    const tree = await api('POST', '/trees', { schema_id: Number(schemaId), title });
    await loadTrees();
    closeTreeModal();
    await selectTree(tree.id);
    toast('Дерево создано');
  } catch (err) {
    handleError(err);
  }
}

async function deleteCurrentTree() {
  const tree = state.trees.find((t) => t.id === state.activeTreeId);
  if (!tree) return;
  try {
    await api('DELETE', `/trees/${tree.id}`);
    await loadTrees();
    state.activeTreeId = state.trees.length ? state.trees[0].id : null;
    if (state.activeTreeId) {
      await selectTree(state.activeTreeId);
    } else {
      state.nodes = []; state.fields = []; state.activeSchemaId = null; state.selectedNodeId = null;
      renderAll();
    }
    toast('Дерево удалено');
  } catch (err) {
    handleError(err);
  }
}

// ---------- Общий рендер ----------
function renderAll() {
  renderTreeSelect();
  renderFields();
  renderDiagram();
  renderNodeEditor();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Инициализация ----------
function bindEvents() {
  $('#tree-select').addEventListener('change', (e) => {
    const id = Number(e.target.value);
    if (id) selectTree(id);
  });
  $('#new-tree-btn').addEventListener('click', openTreeModal);
  $('#delete-tree-btn').addEventListener('click', deleteCurrentTree);
  $('#tree-modal-cancel').addEventListener('click', closeTreeModal);
  $('#tree-form').addEventListener('submit', submitTreeForm);

  $('#add-field-btn').addEventListener('click', () => openFieldForm(null));
  $('#field-cancel').addEventListener('click', closeFieldForm);
  $('#field-form').addEventListener('submit', submitFieldForm);
  $('#field-type').addEventListener('change', toggleOptionsField);

  // закрытие модалки по клику на фон
  $('#tree-modal').addEventListener('click', (e) => {
    if (e.target.id === 'tree-modal') closeTreeModal();
  });
}

async function init() {
  bindEvents();
  try {
    await Promise.all([loadSchemas(), loadTrees()]);
    if (state.trees.length) {
      await selectTree(state.trees[0].id);
    } else {
      renderAll();
    }
  } catch (err) {
    handleError(err);
    renderAll();
  }
}

init();
