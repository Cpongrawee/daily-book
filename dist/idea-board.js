(function (root) {
  'use strict';
  // Idea Board: a big chalkboard of notes, links and pictures, stored as `book.board`.
  // Pictures live as files in data/board-images; the book only keeps their names.
  const COLORS = ['yellow', 'pink', 'blue', 'green', 'white'];
  const IMAGE_NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const LIMITS = { items: 2000, text: 5000, title: 300, url: 2000, coord: 1e6, minW: 80, maxW: 2000 };
  const escape = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  // Accept http(s) addresses only, so a card can never hold a javascript: link. "example.com/x" gets https://.
  function safeUrl(text) {
    let s = String(text ?? '').trim();
    if (!s || /\s/.test(s) || s.length > LIMITS.url) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      if (!/^[^/]+\.[a-z]{2,}([/:?#]|$)/i.test(s)) return '';
      s = 'https://' + s;
    }
    try {
      const u = new URL(s);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.href : '';
    } catch {
      return '';
    }
  }
  // Text that is just one address (what a paste should turn into a link card).
  const looksLikeUrl = text => /^(https?:\/\/|www\.)\S+$/i.test(String(text ?? '').trim()) && !!safeUrl(text);
  const hostOf = url => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  const emptyBoard = () => ({ version: 1, items: [] });
  const nextZ = items => items.reduce((z, item) => Math.max(z, item.z), 0) + 1;
  function validItem(item) {
    const str = (x, max) => typeof x === 'string' && x.length <= max;
    const num = (x, max) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= max;
    if (
      !item ||
      typeof item !== 'object' ||
      !str(item.id, 100) ||
      !item.id ||
      !num(item.x, LIMITS.coord) ||
      !num(item.y, LIMITS.coord) ||
      !num(item.w, LIMITS.maxW) ||
      item.w < LIMITS.minW ||
      !Number.isSafeInteger(item.z) ||
      item.z < 0
    )
      return false;
    if (item.kind === 'note') return str(item.text, LIMITS.text) && COLORS.includes(item.color);
    if (item.kind === 'link') return safeUrl(item.url) === item.url && str(item.title, LIMITS.title);
    if (item.kind === 'image') return IMAGE_NAME.test(item.image) && num(item.ratio, 100) && item.ratio >= 0.01;
    return false;
  }
  function validBoard(board) {
    return (
      !!board &&
      typeof board === 'object' &&
      !Array.isArray(board) &&
      board.version === 1 &&
      Array.isArray(board.items) &&
      board.items.length <= LIMITS.items &&
      board.items.every(validItem) &&
      new Set(board.items.map(i => i.id)).size === board.items.length
    );
  }
  // Approximate card height (notes and links grow with their text; this is close enough for layout).
  const heightOf = i => (i.kind === 'image' ? i.w * i.ratio + 30 : i.kind === 'link' ? 90 : 140);
  // Smallest box around all cards, or null for an empty board.
  function bounds(items) {
    if (!items.length) return null;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const i of items) {
      left = Math.min(left, i.x);
      top = Math.min(top, i.y);
      right = Math.max(right, i.x + i.w);
      bottom = Math.max(bottom, i.y + heightOf(i));
    }
    return { left, top, right, bottom };
  }
  // The nearest spot to `at` where a w×h card overlaps no other card (sideways counts a little closer;
  // on a tie, below and to the right win). Falls back to `at` on a very crowded board.
  const SPOTS = [];
  for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) SPOTS.push([dx, dy]);
  SPOTS.sort(([ax, ay], [bx, by]) => Math.hypot(ax * 0.8, ay) - Math.hypot(bx * 0.8, by) || by - ay || bx - ax);
  function freeSpot(items, at, w, h, gap = 20) {
    const clear = (x, y) =>
      items.every(
        i => x + w + gap <= i.x || i.x + i.w + gap <= x || y + h + gap <= i.y || i.y + heightOf(i) + gap <= y
      );
    for (const [dx, dy] of SPOTS) {
      const x = Math.round(at.x + dx * 40),
        y = Math.round(at.y + dy * 40);
      if (clear(x, y)) return { x, y };
    }
    return { x: Math.round(at.x), y: Math.round(at.y) };
  }
  // A small, steady tilt per card so the board looks hand-pinned but never jumps between renders.
  function tilt(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 50) - 25) / 10;
  }

  function markup() {
    return `<section id="idea-board" class="idea-board" aria-label="Idea board"><div class="board-toolbar" role="toolbar" aria-label="Idea board tools"><button type="button" class="primary" data-board-add="note">+ Note</button><button type="button" data-board-add="link">+ Link</button><button type="button" data-board-add="image">+ Picture</button><input type="file" data-board-file accept="${IMAGE_TYPES.join(',')}" multiple hidden><span class="board-zoom"><button type="button" data-board-zoom="-1" aria-label="Zoom out">−</button><output data-board-zoom-level aria-label="Zoom level">100%</output><button type="button" data-board-zoom="1" aria-label="Zoom in">+</button><button type="button" data-board-fit>Fit all</button></span></div><form class="board-link-form" hidden><label>Link address<input name="url" type="text" inputmode="url" autocomplete="off" required maxlength="${LIMITS.url}" placeholder="https://…"></label><label>Name (optional)<input name="title" autocomplete="off" maxlength="${LIMITS.title}" placeholder="What is this link?"></label><div class="board-link-actions"><button type="button" data-board-link-cancel>Cancel</button><button class="primary" data-board-link-submit>Pin link</button></div></form><p class="board-hint">Double-click the board for a note · <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes a picture or link · Drag pictures in · Scroll to zoom · Drag the board to look around</p><div class="board-frame"><div class="board-viewport" tabindex="0" aria-label="Chalkboard. Press N for a new note." aria-describedby="board-keys"><div class="board-canvas"></div><div class="board-empty" aria-hidden="true"><strong>Your ideas go here</strong><span>Double-click anywhere to write the first one</span></div></div></div><p id="board-keys" class="board-keys">On a card: Enter edits · Delete removes · arrow keys move it.</p><p class="board-status" role="status"></p></section>`;
  }

  function itemMarkup(item) {
    const bar = extra =>
      `<div class="board-item-bar">${extra}<button type="button" data-board-delete aria-label="Delete this ${item.kind === 'image' ? 'picture' : item.kind}" title="Delete">×</button></div>`;
    const resize = '<span class="board-resize" aria-hidden="true"></span>';
    if (item.kind === 'note')
      return `<article class="board-item board-note note-${item.color}" data-board-id="${escape(item.id)}" tabindex="0" aria-label="Note: ${escape(item.text.slice(0, 80) || 'empty')}">${bar(
        COLORS.map(
          c =>
            `<button type="button" class="board-swatch swatch-${c}" data-board-color="${c}" aria-label="${c} note" aria-pressed="${c === item.color}"></button>`
        ).join('')
      )}<div class="board-note-text">${escape(item.text) || '<span class="board-placeholder">Double-click to write…</span>'}</div>${resize}</article>`;
    if (item.kind === 'link') {
      const host = hostOf(item.url);
      return `<article class="board-item board-link-card" data-board-id="${escape(item.id)}" tabindex="0" aria-label="Link: ${escape(item.title || host)}">${bar('<button type="button" data-board-edit-link aria-label="Edit link" title="Edit">✎</button>')}<a class="board-link" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer" draggable="false"><span class="board-link-icon" aria-hidden="true">🔗</span><span class="board-link-text"><strong>${escape(item.title || host)}</strong><small>${escape(host)}</small></span></a>${resize}</article>`;
    }
    return `<article class="board-item board-image" data-board-id="${escape(item.id)}" tabindex="0" aria-label="Picture">${bar('')}<img src="/board-images/${escape(item.image)}" alt="" draggable="false">${resize}</article>`;
  }

  // opts: getBook() (always the live book — saving replaces the object), changed(), getToken(), state {x, y, zoom}.
  function mount(rootEl, opts) {
    const state = opts.state;
    const $ = s => rootEl.querySelector(s);
    const viewport = $('.board-viewport'),
      canvas = $('.board-canvas'),
      linkForm = $('.board-link-form'),
      fileInput = $('[data-board-file]'),
      status = $('.board-status');
    const board = () => (opts.getBook().board ||= emptyBoard());
    const items = () => opts.getBook().board?.items || [];
    const find = id => items().find(i => i.id === id);
    const uid = () => crypto.randomUUID();
    let drag = null,
      editingLink = null,
      pendingAt = null,
      statusTimer;
    function say(text, sticky = false) {
      status.textContent = text;
      clearTimeout(statusTimer);
      if (text && !sticky) statusTimer = setTimeout(() => (status.textContent = ''), 5000);
    }
    function applyView() {
      canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
      // Only the dot grid travels with the board; the chalk smudges stay put.
      viewport.style.backgroundPosition = `${state.x}px ${state.y}px, 0 0, 0 0, 0 0`;
      $('[data-board-zoom-level]').textContent = Math.round(state.zoom * 100) + '%';
    }
    function place(el, item) {
      el.style.left = item.x + 'px';
      el.style.top = item.y + 'px';
      el.style.width = item.w + 'px';
      el.style.zIndex = item.z;
      el.style.setProperty('--tilt', tilt(item.id) + 'deg');
      if (item.kind === 'image') el.querySelector('img').style.height = item.w * item.ratio + 'px';
    }
    function draw(focusId) {
      const list = items();
      canvas.innerHTML = list.map(itemMarkup).join('');
      canvas.querySelectorAll('.board-item').forEach(el => place(el, find(el.dataset.boardId)));
      $('.board-empty').hidden = list.length > 0;
      if (focusId) canvas.querySelector(`[data-board-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
    }
    // Rebuild one card only, so a card the user just grabbed keeps its element (and focus).
    function redrawOne(id, focus = false) {
      const old = canvas.querySelector(`[data-board-id="${CSS.escape(id)}"]`),
        item = find(id);
      if (!old || !item) return draw();
      old.insertAdjacentHTML('afterend', itemMarkup(item));
      const el = old.nextElementSibling;
      old.remove();
      place(el, item);
      if (focus) el.focus({ preventScroll: true });
    }
    const toBoard = (clientX, clientY) => {
      const r = viewport.getBoundingClientRect();
      return { x: (clientX - r.left - state.x) / state.zoom, y: (clientY - r.top - state.y) / state.zoom };
    };
    // Where a new card goes when the user didn't point at a place: near the middle of the view, clear of other cards.
    function centre(w = 220, h = 140) {
      const r = viewport.getBoundingClientRect();
      return freeSpot(items(), toBoard(r.left + r.width / 2 - w / 2, r.top + r.height / 2 - h / 2), w, h);
    }
    function add(item) {
      const b = board();
      b.items.push({ ...item, id: uid(), x: Math.round(item.x), y: Math.round(item.y), z: nextZ(b.items) });
      opts.changed();
      return b.items.at(-1);
    }
    function addNote(at = centre(), text = '', edit = true) {
      const item = add({ kind: 'note', text: text.slice(0, LIMITS.text), color: 'yellow', w: 220, ...at });
      draw(item.id);
      if (edit) startEdit(item.id);
    }
    function addLink(url, title = '', at = centre(260, 90)) {
      const item = add({ kind: 'link', url, title: title.slice(0, LIMITS.title), w: 260, ...at });
      draw(item.id);
      say('Link pinned.');
    }
    function remove(id) {
      const b = board();
      b.items = b.items.filter(i => i.id !== id);
      opts.changed();
      draw();
      viewport.focus({ preventScroll: true });
      say('Removed. Use “Undo last change” in the sidebar to bring it back.');
    }
    function bringForward(id) {
      const item = find(id),
        z = nextZ(items());
      if (item && item.z !== z - 1) {
        item.z = z;
        return true;
      }
      return false;
    }
    // Notes are edited in place: the text swaps for a textarea until Escape, Ctrl+Enter or clicking away.
    function startEdit(id) {
      const el = canvas.querySelector(`[data-board-id="${CSS.escape(id)}"]`),
        item = find(id);
      if (!el || item?.kind !== 'note' || el.querySelector('textarea')) return;
      const area = document.createElement('textarea');
      area.className = 'board-note-edit';
      area.maxLength = LIMITS.text;
      area.value = item.text;
      area.setAttribute('aria-label', 'Note text');
      area.placeholder = 'Write your idea…';
      el.querySelector('.board-note-text').replaceWith(area);
      el.classList.add('is-editing');
      area.focus({ preventScroll: true });
      area.setSelectionRange(area.value.length, area.value.length);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const live = find(id);
        if (live && live.text !== area.value) {
          live.text = area.value;
          opts.changed();
        }
        redrawOne(id);
      };
      area.addEventListener('blur', finish);
      area.addEventListener('keydown', e => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          e.stopPropagation();
          finish();
          canvas.querySelector(`[data-board-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
        }
      });
    }
    function openLinkForm(item = null, at = null) {
      editingLink = item?.id || null;
      pendingAt = at;
      linkForm.hidden = false;
      linkForm.elements.url.value = item?.url || '';
      linkForm.elements.title.value = item?.title || '';
      $('[data-board-link-submit]').textContent = item ? 'Save link' : 'Pin link';
      linkForm.elements.url.setCustomValidity('');
      linkForm.elements.url.focus();
    }
    function closeLinkForm() {
      linkForm.hidden = true;
      editingLink = pendingAt = null;
    }
    // Shrink big photos before saving so the data folder stays small; GIFs keep their animation.
    async function prepare(file) {
      if (!IMAGE_TYPES.includes(file.type))
        throw Error(
          `${file.name || 'This file'} can’t be pinned. Use a PNG, JPG, GIF or WebP picture (iPhone/Samsung HEIC photos: save or share them as JPG first).`
        );
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap,
        ratio = height / width,
        max = 1600;
      let blob = file;
      if (file.type !== 'image/gif' && (Math.max(width, height) > max || file.size > 1.5 * 1024 * 1024)) {
        const scale = Math.min(1, max / Math.max(width, height)),
          c = document.createElement('canvas');
        c.width = Math.round(width * scale);
        c.height = Math.round(height * scale);
        c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
        blob = await new Promise(resolve => c.toBlob(resolve, 'image/webp', 0.9));
      }
      bitmap.close();
      if (blob.size > 8 * 1024 * 1024) throw Error('This picture is too large (8 MB is the limit).');
      return { blob, ratio: Math.min(100, Math.max(0.01, ratio)), width };
    }
    async function addImages(files, at = null) {
      const pictures = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (!pictures.length) return false;
      for (const [n, file] of pictures.entries()) {
        try {
          say(`Pinning picture${pictures.length > 1 ? ` ${n + 1} of ${pictures.length}` : ''}…`, true);
          const { blob, ratio, width } = await prepare(file);
          const res = await fetch('/api/board-images', {
            method: 'POST',
            headers: { 'Content-Type': blob.type, 'X-Book-Token': opts.getToken() },
            body: blob
          });
          const result = await res.json();
          if (!res.ok) throw Error(result.error || 'The picture could not be saved.');
          const w = Math.max(LIMITS.minW, Math.min(320, width));
          const spot = at ? { x: at.x + n * 24, y: at.y + n * 24 } : centre(w, w * ratio + 30);
          const item = add({ kind: 'image', image: result.image, ratio, w, ...spot });
          draw(item.id);
          say('Picture pinned.');
        } catch (e) {
          say(e.message, true);
        }
      }
      return true;
    }
    function zoomAt(factor, clientX, clientY) {
      const r = viewport.getBoundingClientRect();
      const px = clientX ?? r.left + r.width / 2,
        py = clientY ?? r.top + r.height / 2;
      const before = toBoard(px, py);
      state.zoom = Math.min(2.5, Math.max(0.25, state.zoom * factor));
      state.x = px - r.left - before.x * state.zoom;
      state.y = py - r.top - before.y * state.zoom;
      applyView();
    }
    function fit() {
      const box = bounds(items()),
        r = viewport.getBoundingClientRect();
      if (!box) {
        Object.assign(state, { x: 40, y: 40, zoom: 1 });
      } else {
        const pad = 60;
        state.zoom = Math.min(
          1.25,
          Math.max(
            0.25,
            Math.min((r.width - pad * 2) / (box.right - box.left), (r.height - pad * 2) / (box.bottom - box.top))
          )
        );
        state.x = (r.width - (box.right - box.left) * state.zoom) / 2 - box.left * state.zoom;
        state.y = (r.height - (box.bottom - box.top) * state.zoom) / 2 - box.top * state.zoom;
      }
      applyView();
    }

    rootEl.addEventListener('click', e => {
      const t = e.target;
      const card = t.closest('.board-item'),
        id = card?.dataset.boardId;
      if (t.closest('[data-board-add="note"]')) addNote();
      else if (t.closest('[data-board-add="link"]')) openLinkForm();
      else if (t.closest('[data-board-add="image"]')) fileInput.click();
      else if (t.closest('[data-board-zoom]'))
        zoomAt(t.closest('[data-board-zoom]').dataset.boardZoom > 0 ? 1.25 : 0.8);
      else if (t.closest('[data-board-fit]')) fit();
      else if (t.closest('[data-board-link-cancel]')) closeLinkForm();
      else if (t.closest('[data-board-delete]') && id) remove(id);
      else if (t.closest('[data-board-edit-link]') && id) openLinkForm(find(id));
      else if (t.closest('[data-board-color]') && id) {
        const item = find(id);
        item.color = t.closest('[data-board-color]').dataset.boardColor;
        opts.changed();
        redrawOne(id, true);
      } else if (t.closest('.board-link') && card?.dataset.dragged) e.preventDefault();
    });
    linkForm.addEventListener('submit', e => {
      e.preventDefault();
      const url = safeUrl(linkForm.elements.url.value),
        title = linkForm.elements.title.value.trim();
      if (!url) {
        linkForm.elements.url.setCustomValidity('Enter a web address that starts with http:// or https://');
        linkForm.elements.url.reportValidity();
        return;
      }
      const editing = editingLink && find(editingLink);
      if (editing) {
        editing.url = url;
        editing.title = title;
        opts.changed();
        draw(editing.id);
        say('Link saved.');
      } else addLink(url, title, pendingAt || centre(260, 90));
      closeLinkForm();
    });
    linkForm.elements.url.addEventListener('input', () => linkForm.elements.url.setCustomValidity(''));
    linkForm.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLinkForm();
    });
    fileInput.addEventListener('change', async () => {
      await addImages(fileInput.files);
      fileInput.value = '';
    });
    canvas.addEventListener('dblclick', e => {
      const card = e.target.closest('.board-note');
      if (card && !e.target.closest('.board-item-bar')) startEdit(card.dataset.boardId);
    });
    viewport.addEventListener('dblclick', e => {
      if (!e.target.closest('.board-item')) addNote(toBoard(e.clientX - 20, e.clientY - 20));
    });
    viewport.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, textarea, input')) return;
      const card = e.target.closest('.board-item');
      if (card) {
        const item = find(card.dataset.boardId);
        if (!item) return;
        delete card.dataset.dragged;
        const raised = bringForward(item.id);
        card.style.zIndex = item.z;
        drag = {
          mode: e.target.closest('.board-resize') ? 'resize' : 'move',
          id: item.id,
          el: card,
          startX: e.clientX,
          startY: e.clientY,
          x: item.x,
          y: item.y,
          w: item.w,
          moved: false,
          raised
        };
      } else drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, x: state.x, y: state.y, moved: false };
      (card || viewport).setPointerCapture(e.pointerId);
      // Cards keep the default so they take focus (and an open note editor closes); the bare board would select text.
      if (!card) {
        e.preventDefault();
        viewport.focus({ preventScroll: true });
      }
    });
    viewport.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.startX,
        dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (drag.mode === 'pan') {
        state.x = drag.x + dx;
        state.y = drag.y + dy;
        viewport.classList.add('is-panning');
        applyView();
        return;
      }
      const item = find(drag.id);
      if (!item) return;
      // Closing a note editor redraws that card, so re-find it if the grabbed element was replaced.
      if (!drag.el.isConnected) drag.el = canvas.querySelector(`[data-board-id="${CSS.escape(drag.id)}"]`);
      if (!drag.el) return;
      drag.el.classList.add('is-dragging');
      drag.el.dataset.dragged = 'true';
      if (drag.mode === 'move') {
        drag.el.style.left = drag.x + dx / state.zoom + 'px';
        drag.el.style.top = drag.y + dy / state.zoom + 'px';
      } else {
        const w = Math.min(LIMITS.maxW, Math.max(LIMITS.minW, drag.w + dx / state.zoom));
        drag.el.style.width = w + 'px';
        if (item.kind === 'image') drag.el.querySelector('img').style.height = w * item.ratio + 'px';
      }
    });
    function endDrag(e) {
      if (!drag) return;
      const d = drag;
      drag = null;
      viewport.classList.remove('is-panning');
      if (d.mode === 'pan') return;
      if (!d.el.isConnected) d.el = canvas.querySelector(`[data-board-id="${CSS.escape(d.id)}"]`);
      const item = find(d.id);
      if (!item || !d.el) return;
      d.el.classList.remove('is-dragging');
      if (d.moved && e.type !== 'pointercancel') {
        const dx = (e.clientX - d.startX) / state.zoom,
          dy = (e.clientY - d.startY) / state.zoom;
        if (d.mode === 'move') {
          item.x = Math.round(Math.max(-LIMITS.coord, Math.min(LIMITS.coord, d.x + dx)));
          item.y = Math.round(Math.max(-LIMITS.coord, Math.min(LIMITS.coord, d.y + dy)));
        } else item.w = Math.round(Math.min(LIMITS.maxW, Math.max(LIMITS.minW, d.w + dx)));
        opts.changed();
      } else if (d.moved) place(d.el, item);
      else if (d.raised) opts.changed();
      // Let the click that follows a drag see `dragged` (so a link isn't opened), then forget it.
      setTimeout(() => delete d.el.dataset.dragged, 0);
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false }
    );
    viewport.addEventListener('dragover', e => {
      e.preventDefault();
      viewport.classList.add('is-drop-target');
    });
    viewport.addEventListener('dragleave', e => {
      if (!viewport.contains(e.relatedTarget)) viewport.classList.remove('is-drop-target');
    });
    viewport.addEventListener('drop', async e => {
      e.preventDefault();
      viewport.classList.remove('is-drop-target');
      const at = toBoard(e.clientX - 40, e.clientY - 40);
      if (e.dataTransfer.files.length) {
        if (!(await addImages(e.dataTransfer.files, at))) say('Only pictures can be dropped on the board.');
        return;
      }
      const text = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '')
        .split('\n')
        .find(line => line && !line.startsWith('#'));
      if (text && safeUrl(text)) addLink(safeUrl(text), '', at);
      else if (text?.trim()) addNote(at, text.trim(), false);
    });
    rootEl.addEventListener('keydown', e => {
      if (e.target.closest('textarea, input, form')) return;
      const card = e.target.closest('.board-item');
      if (!card) {
        if (e.target === viewport && (e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          addNote();
        }
        return;
      }
      const id = card.dataset.boardId,
        item = find(id);
      if (!item || e.target !== card) return;
      const step = e.shiftKey ? 50 : 10,
        moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (item.kind === 'note') startEdit(id);
        else if (item.kind === 'link') openLinkForm(item);
      } else if (moves[e.key]) {
        e.preventDefault();
        item.x += moves[e.key][0];
        item.y += moves[e.key][1];
        place(card, item);
        opts.changed();
      }
    });
    // Paste anywhere on this page (outside text fields): pictures, a single link, or plain text as a note.
    const onPaste = async e => {
      if (e.target.closest?.('textarea, input, [contenteditable="true"]')) return;
      const data = e.clipboardData;
      if (!data) return;
      if (data.files.length) {
        e.preventDefault();
        await addImages(data.files);
        return;
      }
      const text = data.getData('text/plain').trim();
      if (!text) return;
      e.preventDefault();
      if (looksLikeUrl(text)) addLink(safeUrl(text));
      else addNote(centre(), text, false);
    };
    document.addEventListener('paste', onPaste);

    if (!state.ready) {
      state.ready = true;
      requestAnimationFrame(() => {
        if (items().length) fit();
      });
    }
    applyView();
    draw();
    viewport.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('paste', onPaste);
      clearTimeout(statusTimer);
    };
  }

  const api = {
    COLORS,
    IMAGE_NAME,
    IMAGE_TYPES,
    LIMITS,
    safeUrl,
    looksLikeUrl,
    hostOf,
    emptyBoard,
    nextZ,
    validItem,
    validBoard,
    bounds,
    freeSpot,
    tilt,
    markup,
    itemMarkup,
    mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DailyBookIdeaBoard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
