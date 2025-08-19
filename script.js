(function(){
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const storeKey = 'todo.tasks.v2';
  const themeKey = 'todo.theme';

  let tasks = load();
  let filter = 'all';

  const els = {
    form: $('#todoForm'),
    title: $('#title'),
    due: $('#due'),
    prio: $('#priority'),
    list: $('#list'),
    empty: $('#empty'),
    stats: $('#stats'),
    filters: $$('.filters button'),
    clearCompleted: $('#clearCompleted'),
    exportJson: $('#exportJson'),
    importJson: $('#importJson'),
    importFile: $('#importFile'),
    autosort: $('#autosort'),
    themeToggle: $('#themeToggle'),
    search: $('#search'),
    itemTemplate: $('#itemTemplate')
  };

  // THEME
  (function initTheme(){
    const saved = localStorage.getItem(themeKey);
    if (saved === 'dark') document.body.classList.add('theme-dark');
    els.themeToggle.setAttribute('aria-pressed', document.body.classList.contains('theme-dark'));
    els.themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('theme-dark');
      const isDark = document.body.classList.contains('theme-dark');
      els.themeToggle.setAttribute('aria-pressed', isDark);
      localStorage.setItem(themeKey, isDark ? 'dark' : 'light');
    });
  })();

  // SHORTCUTS
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); els.search.focus(); }
    if (e.key === 'Escape') { els.search.value = ''; render(); }
  });

  // FORM
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = els.title.value.trim();
    if (!title) return;
    const t = {
      id: uid(),
      title,
      completed: false,
      due: els.due.value || undefined,
      priority: /** @type {any} */ (els.prio.value || 'medium'),
      created: Date.now(),
      order: tasks.length ? Math.max(...tasks.map(t=>t.order)) + 1 : 1
    };
    tasks.push(t);
    save();
    els.title.value = '';
    els.due.value = '';
    els.prio.value = 'medium';
    render();
    els.title.focus();
  });

  // FILTERS
  els.filters.forEach(btn => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    els.filters.forEach(b => b.setAttribute('aria-pressed', String(b===btn)));
    render();
  }));

  // SEARCH
  els.search.addEventListener('input', () => render());

  // CLEAR COMPLETED
  els.clearCompleted.addEventListener('click', () => {
    tasks = tasks.filter(t => !t.completed);
    save();
    render();
  });

  // EXPORT
  els.exportJson.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tasks.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // IMPORT
  els.importJson.addEventListener('click', () => {
    els.importFile.click();
  });
  els.importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        // Merge imported tasks, ensuring unique IDs
        for (const d of data) {
          if (!tasks.find(t => t.id === d.id)) {
            d.id = d.id || uid();
            d.order = tasks.length ? Math.max(...tasks.map(t=>t.order)) + 1 : 1;
            tasks.push(d);
          }
        }
        save();
        render();
      } else {
        alert('Invalid JSON format.');
      }
    } catch {
      alert('Failed to import JSON file.');
    }
    els.importFile.value = '';
  });

  // AUTOSORT
  els.autosort.addEventListener('change', () => render());

  // DRAG & DROP
  let dragId = null;
  els.list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li.item');
    if (!li) return; li.classList.add('dragging');
    dragId = li.dataset.id; e.dataTransfer.effectAllowed = 'move';
  });
  els.list.addEventListener('dragend', (e) => {
    const li = e.target.closest('li.item');
    if (li) li.classList.remove('dragging');
    dragId = null;
  });
  els.list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterEl = getDragAfterElement(els.list, e.clientY);
    const dragging = els.list.querySelector('.item.dragging');
    if (!dragging) return;
    if (afterEl == null) {
      els.list.appendChild(dragging);
    } else {
      els.list.insertBefore(dragging, afterEl);
    }
  });
  els.list.addEventListener('drop', () => {
    // Apply new order based on DOM
    const ids = $$('.item', els.list).map(li => li.dataset.id);
    ids.forEach((id, idx) => {
      const t = tasks.find(t => t.id === id);
      if (t) t.order = idx + 1;
    });
    save();
    render();
  });

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.item:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // RENDER
  function render(){
    let list = [...tasks];
    const q = els.search.value.trim().toLowerCase();
    if (q) list = list.filter(t => t.title.toLowerCase().includes(q));
    if (filter === 'active') list = list.filter(t => !t.completed);
    if (filter === 'completed') list = list.filter(t => t.completed);

    if (els.autosort.checked) {
      const prioScore = { high: 0, medium: 1, low: 2 };
      list.sort((a,b) => (prioScore[a.priority]-prioScore[b.priority]) || Number(a.completed) - Number(b.completed) || (a.due||'').localeCompare(b.due||'') || a.created - b.created);
    } else {
      list.sort((a,b) => a.order - b.order);
    }

    els.list.innerHTML = '';
    for (const t of list) {
      const li = els.itemTemplate.content.firstElementChild.cloneNode(true);
      li.dataset.id = t.id;
      if (t.completed) li.classList.add('completed');
      const cb = $('.checkbox', li);
      const text = $('.text', li);
      const dueChip = $('.due', li);
      const dueText = $('.due-text', li);
      const prioChip = $('.prio', li);
      const prioText = $('.prio-text', li);
      const editBtn = $('.edit', li);
      const delBtn = $('.del', li);

      text.textContent = t.title;
      prioChip.classList.remove('low','medium','high');
      prioChip.classList.add(t.priority);
      prioText.textContent = t.priority;

      if (t.due) {
        dueChip.hidden = false;
        const d = new Date(t.due + 'T00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const diff = Math.round((d - today) / 86400000);
        let label = d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
        if (diff === 0) label = 'Today';
        else if (diff === 1) label = 'Tomorrow';
        else if (diff < 0) label = `${Math.abs(diff)} day${Math.abs(diff)!==1?'s':''} ago`;
        else if (diff <= 7) label = `${diff} day${diff!==1?'s':''}`;
        dueText.textContent = label;
        // Overdue accent
        if (diff < 0 && !t.completed) dueChip.style.borderColor = 'var(--danger)';
      }

      cb.checked = t.completed;
      cb.addEventListener('change', () => { t.completed = cb.checked; save(); render(); });

      li.addEventListener('dblclick', () => startInlineEdit(li, t));
      editBtn.addEventListener('click', () => startInlineEdit(li, t));

      delBtn.addEventListener('click', () => {
        tasks = tasks.filter(x => x.id !== t.id); save(); render();
      });

      els.list.appendChild(li);
    }

    els.empty.hidden = list.length !== 0 || tasks.length !== 0 ? list.length !== 0 : true; // show only if total 0

    const remaining = tasks.filter(t=>!t.completed).length;
    const all = tasks.length;
    els.stats.textContent = `${all} task${all!==1?'s':''} • ${remaining} left`;
  }

  function startInlineEdit(li, t) {
    const span = $('.text', li);
    const input = document.createElement('input');
    input.type = 'text'; input.value = t.title; input.setAttribute('aria-label', 'Edit task');
    span.replaceWith(input);
    input.focus(); input.select();
    const finish = (ok) => {
      if (ok) { t.title = input.value.trim() || t.title; save(); }
      input.replaceWith(span); span.textContent = t.title; render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true), { once: true });
  }

  function save(){ localStorage.setItem(storeKey, JSON.stringify(tasks)); }
  function load(){ try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; } }

  // First paint
  render();

})();