'use strict';

const state = {
  trees: [],
  activeTreeId: null,
  fields: [],
  nodes: [],
  selectedNodeId: null,
};

async function api(path) {
  const res = await fetch('/api' + path);
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return res.json();
}

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadTrees() {
  state.trees = await api('/trees');
}

async function selectTree(treeId) {
  state.activeTreeId = treeId;
  state.selectedNodeId = null;
  closeDetail();
  const tree = state.trees.find((t) => t.id === treeId);
  if (!tree) { state.fields = []; state.nodes = []; renderDiagram(); return; }
  const [fields, nodes] = await Promise.all([
    api(`/schemas/${tree.schema_id}/fields`),
    api(`/trees/${treeId}/nodes`),
  ]);
  state.fields = fields;
  state.nodes = nodes;
  renderDiagram();
}

function renderTreeSelect() {
  const sel = $('#tree-select');
  sel.innerHTML = '';
  if (state.trees.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '— нет деревьев —';
    sel.appendChild(opt);
    return;
  }
  state.trees.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    if (t.id === state.activeTreeId) opt.selected = true;
    sel.appendChild(opt);
  });
}

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
        inner += `<div class="node-title">${val ? escapeHtml(val) : '<span class="node-empty">без названия</span>'}</div>`;
      } else if (val) {
        inner += `<div class="node-line">${escapeHtml(f.label)}: ${escapeHtml(val)}</div>`;
      }
    });
  }
  const selected = node.id === state.selectedNodeId ? ' selected' : '';
  return `<div class="node-box${selected}" data-id="${node.id}">${inner}</div>`;
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
    container.innerHTML = '<div class="empty-state">Нет деревьев для отображения</div>';
    return;
  }

  const roots = buildTree(state.nodes);
  if (roots.length === 0) {
    container.innerHTML = '<div class="empty-state">Дерево пустое</div>';
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'diagram-inner';
  inner.innerHTML = renderTreeHtml(roots);
  container.appendChild(inner);

  container.querySelectorAll('.node-box').forEach((box) => {
    box.addEventListener('click', () => openDetail(Number(box.dataset.id)));
  });
}

function openDetail(id) {
  state.selectedNodeId = id;
  renderDiagram();

  const node = state.nodes.find((n) => n.id === id);
  if (!node) return;

  const titleField = previewFields()[0];
  const titleVal = titleField && node.data ? node.data[titleField.key] : '';
  $('#detail-title').textContent = titleVal ? String(titleVal) : `Узел #${node.id}`;

  const dl = $('#detail-fields');
  dl.innerHTML = '';
  if (state.fields.length === 0) {
    dl.innerHTML = '<div class="detail-empty">Нет полей</div>';
  } else {
    state.fields.forEach((f) => {
      const val = node.data && node.data[f.key] != null && node.data[f.key] !== ''
        ? String(node.data[f.key]) : '—';
      const dt = document.createElement('dt');
      dt.textContent = f.label;
      const dd = document.createElement('dd');
      dd.textContent = val;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }
  $('#detail').classList.remove('hidden');
}

function closeDetail() {
  $('#detail').classList.add('hidden');
  state.selectedNodeId = null;
  renderDiagram();
}

function bindEvents() {
  $('#tree-select').addEventListener('change', (e) => {
    const id = Number(e.target.value);
    if (id) selectTree(id);
  });
  $('#detail-close').addEventListener('click', closeDetail);
}

async function init() {
  bindEvents();
  try {
    await loadTrees();
    renderTreeSelect();
    if (state.trees.length) {
      await selectTree(state.trees[0].id);
    } else {
      renderDiagram();
    }
  } catch (err) {
    console.error(err);
    $('#diagram').innerHTML = '<div class="empty-state">Не удалось загрузить данные</div>';
  }
}

init();
