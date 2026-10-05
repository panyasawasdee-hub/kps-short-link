import './style.css';

const API = (import.meta.env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbxq6lXJWgs9CDTDJp9S-ehpehPFhRXHpRxrEo6TqMaep4W4tUImfB9UmmMzbTZU60KeGQ/exec').trim();
const SHORT_BASE = (import.meta.env.VITE_SHORT_BASE || 'https://panyasawasdee-hub.github.io/').trim();
const QR_PREVIEW_SIZE = 220;
const app = document.querySelector('#app');
const state = { page: 'home', links: [], selected: null, result: null, dashboard: null, stats: null, filter: 'all', search: '', qrSize: 512, busy: false };
const labels = { home: 'สร้างลิงก์สั้น', links: 'ลิงก์ทั้งหมด', dashboard: 'แดชบอร์ด', detail: 'รายละเอียดลิงก์', settings: 'ตั้งค่าระบบ', guide: 'คู่มือการใช้งาน' };

function el(tag, className = '', text = '') { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function html(strings, ...values) { return strings.reduce((s, part, i) => s + part + (i < values.length ? escape(values[i]) : ''), ''); }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function fmtDate(value) { return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function fmtNumber(value) { return Number(value || 0).toLocaleString('th-TH'); }
function statusOf(link) { return link.status === 'active' ? 'ใช้งานอยู่' : link.status === 'expired' ? 'หมดอายุ' : 'ปิดใช้งาน'; }
function toast(message, bad = false) { const box = el('div', 'toast' + (bad ? ' bad' : ''), message); document.body.append(box); setTimeout(() => box.remove(), 3400); }
function configured() { if (!API || API.includes('YOUR_DEPLOYMENT_ID')) { toast('กรุณาตั้งค่า VITE_GAS_URL ก่อนใช้งาน', true); return false; } return true; }
function route(page, code) { location.hash = page === 'detail' ? `#/detail/${encodeURIComponent(code)}` : `#/${page}`; }
function currentRoute() { const bits = location.hash.replace(/^#\/?/, '').split('/'); return { page: ['home', 'links', 'dashboard', 'detail', 'settings', 'guide'].includes(bits[0]) ? bits[0] : 'home', code: decodeURIComponent(bits[1] || '') }; }
function publicClientId() {
  const key = 'kps_public_client_id';
  let id = localStorage.getItem(key);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id || '')) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
function publicShortUrl(link) {
  const code = link.alias || String(link.code).replace(/^0+(?=\d)/, '');
  const url = new URL(SHORT_BASE); url.search = `?${encodeURIComponent(code)}`; url.hash = ''; return url.href;
}
function normalizeLink(link) { return link && link.code ? { ...link, shortUrl: publicShortUrl(link) } : link; }
function normalizePayload(data) {
  if (Array.isArray(data)) return data.map(normalizeLink);
  if (data?.topLinks) return { ...data, topLinks: data.topLinks.map(normalizeLink) };
  return normalizeLink(data);
}

function mutate(action, body) {
  if (!configured()) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API'));
  const token = sessionStorage.getItem('kps_admin_token');
  const isPublicCreate = action === 'createLink';
  if (!isPublicCreate && !token) return Promise.reject(new Error('กรุณาเข้าสู่ระบบผู้ดูแล'));
  return new Promise((resolve, reject) => {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = el('iframe', 'transport-frame'); iframe.name = `transport_${nonce}`;
    const form = document.createElement('form'); form.method = 'POST'; form.action = `${API}?action=${encodeURIComponent(action)}`; form.target = iframe.name; form.className = 'transport-frame';
    const payload = { ...body };
    if (token) payload.token = token;
    if (isPublicCreate) payload.clientId = publicClientId();
    for (const [name, value] of Object.entries({ nonce, payload: JSON.stringify(payload) })) {
      const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
    }
    const timer = setTimeout(() => finish(new Error('API ไม่ตอบกลับ กรุณาลองใหม่')), 25000);
    function finish(err, data) { clearTimeout(timer); window.removeEventListener('message', onMessage); form.remove(); iframe.remove(); err ? reject(err) : resolve(data); }
    function onMessage(event) {
      if (!/^https:\/\/([a-z0-9-]+\.)?(googleusercontent\.com|google\.com)$/i.test(event.origin)) return;
      let message; try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message?.type !== 'kps-link-result' || message.nonce !== nonce) return;
      message.result?.success ? finish(null, normalizePayload(message.result.data)) : finish(new Error(message.result?.error?.message || 'บันทึกไม่สำเร็จ'));
    }
    window.addEventListener('message', onMessage); document.body.append(iframe, form); form.submit();
  });
}

function shell(content) {
  const page = state.page;
  app.innerHTML = html`<div class="layout"><aside class="sidebar"><a class="brand" href="#/home"><span class="crest">K</span><span><strong>KPS Link</strong><small>ระบบลิงก์สั้นและคิวอาร์โค้ด</small></span></a><div class="menu-label">MENU</div><nav><a class="${page === 'home' ? 'active' : ''}" href="#/home"><span>＋</span> สร้างลิงก์สั้น</a><a class="${page === 'links' || page === 'detail' ? 'active' : ''}" href="#/links"><span>☷</span> ลิงก์ทั้งหมด <b id="side-count">${state.links.length || ''}</b></a><a class="${page === 'dashboard' ? 'active' : ''}" href="#/dashboard"><span>▥</span> แดชบอร์ด</a></nav><div class="menu-label">SYSTEM</div><nav><a class="${page === 'settings' ? 'active' : ''}" href="#/settings"><span>⚙</span> ตั้งค่าระบบ</a><a class="${page === 'guide' ? 'active' : ''}" href="#/guide"><span>ⓘ</span> คู่มือการใช้งาน</a></nav><div class="side-note"><strong>▦ Dynamic QR</strong><p>QR ที่พิมพ์ไปแล้วใช้ได้ตลอด แม้เปลี่ยนลิงก์ปลายทางภายหลัง</p></div></aside><div class="main"><header class="topbar"><button class="mobile-brand" id="mobile-menu" aria-label="เปิดเมนู">☰</button><span class="breadcrumb">โรงเรียนคำสร้อยพิทยาสรรค์ <span>›</span> <strong>${labels[page] || 'ตั้งค่าระบบ'}</strong></span><button class="top-search" id="top-search">⌕ <span>ค้นหาจากชื่อ รหัส หรือปลายทาง</span><kbd>Ctrl K</kbd></button></header><main id="content"></main><nav class="mobile-nav"><a href="#/home" class="${page === 'home' ? 'active' : ''}">＋<small>สร้างลิงก์</small></a><a href="#/links" class="${page === 'links' || page === 'detail' ? 'active' : ''}">☷<small>ลิงก์ทั้งหมด</small></a><a href="#/dashboard" class="${page === 'dashboard' ? 'active' : ''}">▥<small>แดชบอร์ด</small></a></nav></div></div>`;
  document.querySelector('#content').append(content);
  document.querySelector('#top-search').onclick = () => { route('links'); setTimeout(() => document.querySelector('#search')?.focus(), 50); };
  document.querySelector('#mobile-menu').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
}
function card(title, body, extra = '') { const box = el('section', `card ${extra}`); box.innerHTML = `<h2>${escape(title)}</h2>`; box.append(body); return box; }
function input(label, name, type = 'text', placeholder = '', required = false) { return html`<label class="field"><span>${label}${required ? ' *' : ''}</span><input name="${name}" type="${type}" placeholder="${placeholder}" ${required ? 'required' : ''}></label>`; }
function getFormData(form) { return Object.fromEntries(new FormData(form).entries()); }
function validUrl(value) { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } }

async function renderQR(holder, link) {
  if (!link?.shortUrl) { holder.textContent = 'ยังไม่มี Short URL'; return; }
  holder.textContent = 'กำลังสร้าง QR...';
  const QRCode = (await import('qrcode')).default;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, link.shortUrl, { width: QR_PREVIEW_SIZE, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1c1235', light: '#ffffff' } });
  holder.replaceChildren(canvas);
}
async function downloadQR(link, kind) {
  const QRCode = (await import('qrcode')).default;
  let href;
  if (kind === 'png') href = await QRCode.toDataURL(link.shortUrl, { width: state.qrSize, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1c1235', light: '#ffffff' } });
  else href = URL.createObjectURL(new Blob([await QRCode.toString(link.shortUrl, { type: 'svg', width: state.qrSize, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1c1235', light: '#ffffff' } })], { type: 'image/svg+xml' }));
  const a = document.createElement('a'); a.href = href; a.download = `kps-link-${link.code}.${kind}`; a.click(); if (kind === 'svg') setTimeout(() => URL.revokeObjectURL(href), 1000);
}
async function copy(value) { try { await navigator.clipboard.writeText(value); toast('คัดลอกลิงก์แล้ว'); } catch { toast('คัดลอกไม่ได้ กรุณาคัดลอกด้วยตนเอง', true); } }
function qrPanel(link, dark = false) {
  const panel = el('section', `card qr-panel ${dark ? 'dark' : ''}`);
  panel.innerHTML = html`<div class="panel-heading"><div><h2>${dark ? 'QR Code' : 'ลิงก์พร้อมใช้งาน'}</h2><p>QR นี้เข้ารหัส Short URL เปลี่ยนปลายทางได้ภายหลัง</p></div><span class="success-pill">✓ พร้อมใช้งาน</span></div><div class="url-strip"><span class="short-text">${link.shortUrl}</span><button class="btn btn-dark copy-btn">▣ คัดลอก</button></div><div class="qr-frame"><div class="qr-target"></div></div><div class="size-toggle"><button data-size="256">256</button><button data-size="512">512 px</button><button data-size="1024">1024</button></div><div class="download-row"><button class="btn btn-gold" data-kind="png">♧ PNG</button><button class="btn btn-outline" data-kind="svg">♧ SVG</button></div>`;
  panel.querySelector('.copy-btn').onclick = () => copy(link.shortUrl);
  panel.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => downloadQR(link, b.dataset.kind).catch(e => toast(e.message, true)));
  panel.querySelectorAll('[data-size]').forEach(b => b.onclick = () => { state.qrSize = Number(b.dataset.size); panel.querySelectorAll('[data-size]').forEach(x => x.classList.toggle('active', x === b)); });
  panel.querySelector(`[data-size="${state.qrSize}"]`)?.classList.add('active');
  renderQR(panel.querySelector('.qr-target'), link).catch(e => toast(e.message, true));
  return panel;
}

function renderHome() {
  const wrap = el('div', 'page home-page');
  wrap.innerHTML = `<section class="hero"><div class="eyebrow">KPS SHORT LINK & QR MANAGER</div><h1>ย่อลิงก์ให้สั้น<br>สร้าง <em>QR Code</em> ในไม่กี่วินาที</h1><p>สำหรับ Google Forms, Google Drive, ประกาศ ใบงาน และแบบสำรวจของโรงเรียน<br>เปลี่ยนปลายทางได้ตลอดโดยไม่ต้องพิมพ์ QR ใหม่</p><div class="hero-stats"><span><strong>${fmtNumber(state.dashboard?.totalLinks)}</strong>ลิงก์ทั้งหมด</span><span><strong>${fmtNumber(state.dashboard?.totalClicks)}</strong>คลิกสะสม</span><span><strong>${fmtNumber(state.dashboard?.todayClicks)}</strong>คลิกวันนี้</span></div></section>`;
  const grid = el('div', 'home-grid');
  const formCard = el('section', 'card form-card');
  formCard.innerHTML = `<div class="panel-heading"><span class="icon-box">♧</span><div><h2>สร้างลิงก์สั้นใหม่</h2><p>กรอกข้อมูลแล้วกดสร้าง ระบบจะสร้าง QR ให้อัตโนมัติ</p></div></div><form id="create-form">${input('วางลิงก์ที่ต้องการย่อ', 'targetUrl', 'url', 'https://example.com/long-link', true)}${input('ชื่อลิงก์', 'title', 'text', 'เช่น แบบทดสอบคณิตศาสตร์')}${input('ชื่อเฉพาะ (Alias) · ไม่บังคับ', 'alias', 'text', 'เช่น math2569')}${input('วันหมดอายุ · ไม่บังคับ', 'expiresAt', 'datetime-local')}<button class="btn btn-primary submit-btn" type="submit">สร้างลิงก์สั้น →</button></form>`;
  formCard.querySelector('#create-form').onsubmit = async e => {
    e.preventDefault(); if (state.busy) return;
    const data = getFormData(e.currentTarget);
    if (!validUrl(data.targetUrl)) return toast('กรุณาใช้ URL ที่เริ่มด้วย http:// หรือ https://', true);
    if (data.alias && !/^[A-Za-z0-9_-]{3,40}$/.test(data.alias)) return toast('ชื่อเฉพาะต้องมี 3–40 ตัว ใช้ตัวอักษร ตัวเลข - หรือ _', true);
    state.busy = true; const btn = e.currentTarget.querySelector('.submit-btn'); btn.disabled = true; btn.textContent = 'กำลังสร้าง...';
    try { const link = await mutate('createLink', data); state.result = link; state.links.unshift(link); toast('สร้างลิงก์สำเร็จ'); renderHome(); }
    catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'สร้างลิงก์สั้น →'; }
    finally { state.busy = false; }
  };
  grid.append(formCard);
  if (state.result) grid.append(qrPanel(state.result));
  else { const empty = el('section', 'card empty-result'); empty.innerHTML = '<div class="empty-icon">▦</div><h2>QR Code ของคุณจะแสดงที่นี่</h2><p>วางลิงก์ กดสร้าง แล้วคัดลอกหรือดาวน์โหลด QR Code ได้ทันที</p>'; grid.append(empty); }
  wrap.append(grid);
  const recent = el('section', 'recent'); recent.innerHTML = '<div class="section-heading"><div><h2>ลิงก์ล่าสุด</h2><p>ลิงก์ที่สร้างหรือแก้ไขล่าสุด</p></div><a class="btn btn-outline" href="#/links">ดูทั้งหมด →</a></div>';
  if (state.links.length) recent.append(linkList(state.links.slice(0, 3), true)); else recent.append(el('p', 'muted', 'ยังไม่มีลิงก์'));
  wrap.append(recent); shell(wrap);
}

function linkList(links, compact = false) {
  const container = el('div', `link-list ${compact ? 'compact' : ''}`);
  if (!links.length) { container.append(el('p', 'empty-list', 'ไม่พบลิงก์ที่ตรงกับเงื่อนไข')); return container; }
  links.forEach(link => {
    const row = el('article', 'link-row');
    row.innerHTML = html`<div class="link-identity"><span class="link-icon">▤</span><div><strong>${link.title}</strong><small>${fmtDate(link.createdAt)}</small></div></div><div class="short-col"><a href="${link.shortUrl}" target="_blank" rel="noreferrer">${link.shortUrl || link.code}</a></div><div class="target-col" title="${link.targetUrl}">${link.targetUrl}</div><div class="click-col"><strong>${fmtNumber(link.clicks)}</strong><small>คลิก</small></div><div><span class="status ${link.status}">● ${statusOf(link)}</span></div><div class="row-actions"><button title="คัดลอก" data-action="copy">▢</button><button title="ดู QR Code" data-action="qr">▦</button><button title="รายละเอียด" data-action="detail">•••</button></div>`;
    row.querySelector('[data-action="copy"]').onclick = () => copy(link.shortUrl);
    row.querySelector('[data-action="qr"]').onclick = () => { state.selected = link; showQRDialog(link); };
    row.querySelector('[data-action="detail"]').onclick = () => route('detail', link.code);
    container.append(row);
  }); return container;
}
function showQRDialog(link) { const overlay = el('div', 'modal-overlay'); const panel = qrPanel(link); overlay.append(panel); overlay.onclick = e => { if (e.target === overlay) overlay.remove(); }; const close = el('button', 'modal-close', '×'); close.setAttribute('aria-label', 'ปิด'); close.onclick = () => overlay.remove(); panel.prepend(close); document.body.append(overlay); }
function renderLinks() {
  const wrap = el('div', 'page');
  wrap.innerHTML = '<div class="page-heading"><div><div class="eyebrow">LINK LIBRARY</div><h1>ลิงก์ทั้งหมด</h1><p>จัดการ แก้ไขปลายทาง และดาวน์โหลด QR ของทุกลิงก์</p></div><a href="#/home" class="btn btn-primary">＋ สร้างลิงก์ใหม่</a></div>';
  const board = el('section', 'card list-board');
  board.innerHTML = `<div class="list-toolbar"><input id="search" type="search" placeholder="⌕ ค้นหาชื่อ รหัส alias หรือ URL ปลายทาง" value="${escape(state.search)}"><div class="filter-tabs"><button data-filter="all">ทั้งหมด</button><button data-filter="active">ใช้งานอยู่</button><button data-filter="disabled">ปิดใช้งาน</button><button data-filter="expired">หมดอายุ</button></div><button class="btn btn-outline" id="csv-btn">↓ CSV</button></div><div class="table-head"><span>ชื่อลิงก์</span><span>Short URL</span><span>ปลายทาง</span><span>คลิก</span><span>สถานะ</span><span>การจัดการ</span></div><div id="rows"></div>`;
  function refresh() { const q = state.search.toLowerCase(); const filtered = state.links.filter(l => (state.filter === 'all' || l.status === state.filter) && [l.title, l.code, l.alias, l.targetUrl].some(x => String(x).toLowerCase().includes(q))); board.querySelector('#rows').replaceChildren(linkList(filtered)); board.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === state.filter)); }
  board.querySelector('#search').oninput = e => { state.search = e.target.value; refresh(); };
  board.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { state.filter = b.dataset.filter; refresh(); });
  board.querySelector('#csv-btn').onclick = () => {
    const fields = ['title', 'code', 'shortUrl', 'targetUrl', 'status', 'clicks', 'createdAt'];
    const csv = [fields, ...state.links.map(l => fields.map(f => String(l[f] ?? '')))].map(row => row.map(v => `"${v.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'kps-links.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  refresh(); wrap.append(board); shell(wrap);
}

function renderDetail() {
  const l = state.selected; if (!l) { shell(el('div', 'page', 'ไม่พบลิงก์')); return; }
  const wrap = el('div', 'page');
  wrap.innerHTML = html`<div class="page-heading"><div><span class="status ${l.status}">● ${statusOf(l)}</span><h1>${l.title}</h1><p>รหัส ${l.code}${l.alias ? ` · alias ${l.alias}` : ''}</p></div><div class="heading-actions"><button id="toggle-btn" class="btn btn-outline">${l.status === 'disabled' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button><button id="edit-btn" class="btn btn-primary">✎ แก้ไขปลายทาง</button></div></div><div class="detail-grid"><div><section class="card detail-info"><div><small>Short URL</small><a href="${l.shortUrl}" target="_blank" rel="noreferrer">${l.shortUrl}</a><button class="btn btn-dark" id="copy-detail">คัดลอก</button></div><div><small>ลิงก์ปลายทาง</small><a href="${l.targetUrl}" target="_blank" rel="noreferrer" class="target-link">${l.targetUrl}</a></div><div class="meta-grid"><span><small>สร้างเมื่อ</small>${fmtDate(l.createdAt)}</span><span><small>แก้ไขล่าสุด</small>${fmtDate(l.updatedAt)}</span><span><small>หมดอายุ</small>${fmtDate(l.expiresAt)}</span><span><small>คลิกล่าสุด</small>${fmtDate(l.lastClickedAt)}</span></div></section><div class="stats-grid detail-stats"><section class="card stat-card"><small>คลิกทั้งหมด</small><strong>${fmtNumber(l.clicks)}</strong></section><section class="card stat-card"><small>คลิกวันนี้</small><strong>${fmtNumber(state.stats?.todayClicks)}</strong></section></div><section class="card chart-card"><h2>จำนวนคลิกรายวัน</h2><div id="daily-chart"></div></section></div><div id="detail-qr"></div></div>`;
  wrap.querySelector('#detail-qr').append(qrPanel(l, true));
  wrap.querySelector('#copy-detail').onclick = () => copy(l.shortUrl);
  wrap.querySelector('#edit-btn').onclick = () => showEditDialog(l);
  wrap.querySelector('#toggle-btn').onclick = async () => { try { const next = await mutate(l.status === 'disabled' ? 'enableLink' : 'disableLink', { code: l.code }); state.selected = next; state.links = state.links.map(x => x.code === next.code ? next : x); renderDetail(); toast('บันทึกสถานะแล้ว'); } catch (e) { toast(e.message, true); } };
  drawBars(wrap.querySelector('#daily-chart'), state.stats?.daily || {}, 14); shell(wrap);
}
function showEditDialog(link) {
  const overlay = el('div', 'modal-overlay'); const panel = el('section', 'card edit-modal');
  panel.innerHTML = `<button class="modal-close" aria-label="ปิด">×</button><h2>แก้ไขลิงก์ปลายทาง</h2><p>Short URL และ QR Code จะคงเดิม</p><form id="edit-form">${input('ปลายทาง', 'targetUrl', 'url', '', true)}${input('ชื่อลิงก์', 'title')}${input('วันหมดอายุ · ไม่บังคับ', 'expiresAt', 'datetime-local')}<button class="btn btn-primary" type="submit">บันทึกการเปลี่ยนแปลง</button></form>`;
  panel.querySelector('[name="targetUrl"]').value = link.targetUrl; panel.querySelector('[name="title"]').value = link.title;
  if (link.expiresAt) panel.querySelector('[name="expiresAt"]').value = new Date(new Date(link.expiresAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  panel.querySelector('.modal-close').onclick = () => overlay.remove(); overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  panel.querySelector('#edit-form').onsubmit = async e => { e.preventDefault(); const data = getFormData(e.currentTarget); if (!validUrl(data.targetUrl)) return toast('ปลายทางไม่ถูกต้อง', true); try { const next = await mutate('updateLink', { code: link.code, ...data }); state.selected = next; state.links = state.links.map(x => x.code === next.code ? next : x); overlay.remove(); renderDetail(); toast('เปลี่ยนปลายทางแล้ว QR เดิมยังใช้ได้'); } catch (err) { toast(err.message, true); } };
  overlay.append(panel); document.body.append(overlay);
}
function drawBars(container, daily, days) {
  const values = []; for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toLocaleDateString('sv-SE'); values.push({ label: new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(d), value: daily[key] || 0 }); }
  const max = Math.max(1, ...values.map(v => v.value)); const bars = el('div', 'bars'); values.forEach(v => { const col = el('div', 'bar-col'); const bar = el('div', 'bar'); bar.style.height = `${Math.max(3, v.value / max * 100)}%`; bar.title = `${v.label}: ${v.value} คลิก`; col.append(bar, el('small', '', v.label)); bars.append(col); }); container.replaceChildren(bars);
}
function renderDashboard() {
  const d = state.dashboard || { totalLinks: 0, activeLinks: 0, totalClicks: 0, todayClicks: 0, daily: {}, topLinks: [] };
  const wrap = el('div', 'page'); wrap.innerHTML = `<div class="page-heading"><div><div class="eyebrow">OVERVIEW</div><h1>แดชบอร์ดภาพรวม</h1><p>สถิติการใช้งานลิงก์สั้นของโรงเรียน</p></div></div><div class="stats-grid dashboard-stats"><section class="card stat-card featured"><small>ลิงก์ทั้งหมด</small><strong>${fmtNumber(d.totalLinks)}</strong></section><section class="card stat-card"><small>ลิงก์ใช้งานอยู่</small><strong>${fmtNumber(d.activeLinks)}</strong></section><section class="card stat-card"><small>คลิกทั้งหมด</small><strong>${fmtNumber(d.totalClicks)}</strong></section><section class="card stat-card"><small>คลิกวันนี้</small><strong>${fmtNumber(d.todayClicks)}</strong></section></div><div class="dashboard-grid"><section class="card chart-card"><h2>แนวโน้มการคลิก</h2><p>30 วันล่าสุด</p><div id="dashboard-chart"></div></section><section class="card top-card"><h2>ลิงก์ยอดนิยม</h2><p>เรียงตามจำนวนคลิกทั้งหมด</p><div id="top-links"></div></section></div>`;
  drawBars(wrap.querySelector('#dashboard-chart'), d.daily, 30);
  const top = wrap.querySelector('#top-links'); if (!d.topLinks.length) top.append(el('p', 'muted', 'ยังไม่มีข้อมูล'));
  d.topLinks.forEach((l, i) => { const item = el('a', 'top-link'); item.href = `#/detail/${encodeURIComponent(l.code)}`; item.innerHTML = html`<span>${String(i + 1).padStart(2, '0')}</span><strong>${l.title}</strong><b>${fmtNumber(l.clicks)}</b>`; top.append(item); }); shell(wrap);
}
function renderSettingsLegacy() {
  const wrap = el('div', 'page settings-page'); wrap.innerHTML = html`<div class="page-heading"><div><div class="eyebrow">SYSTEM</div><h1>ตั้งค่าระบบ</h1><p>ตั้งค่ารหัสผู้ดูแลสำหรับสร้างและจัดการลิงก์ในเบราว์เซอร์นี้</p></div></div><section class="card"><h2>การเชื่อมต่อ</h2><p>GAS API: ${API || 'ยังไม่ได้ตั้งค่า VITE_GAS_URL'}</p><form id="token-form"><label class="field"><span>รหัสผู้ดูแล</span><input name="token" type="password" autocomplete="off" placeholder="วาง ADMIN_TOKEN จาก Script Properties" required></label><button class="btn btn-primary" type="submit">บันทึกในเซสชันนี้</button><button class="btn btn-outline" type="button" id="clear-token">ลบรหัส</button></form><p class="muted">รหัสเก็บใน sessionStorage ของแท็บนี้ และจะหายเมื่อปิดแท็บ อย่าใช้เครื่องสาธารณะโดยไม่ออกจากระบบ</p></section>`;
  wrap.querySelector('#token-form').onsubmit = e => { e.preventDefault(); sessionStorage.setItem('kps_admin_token', e.currentTarget.querySelector('[name="token"]').value.trim()); e.currentTarget.reset(); toast('บันทึกรหัสแล้ว'); };
  wrap.querySelector('#clear-token').onclick = () => { sessionStorage.removeItem('kps_admin_token'); toast('ลบรหัสแล้ว'); }; shell(wrap);
}
function renderSettings() {
  const wrap = el('div', 'page settings-page');
  wrap.innerHTML = '<div class="page-heading"><div><div class="eyebrow">ADMIN</div><h1>ผู้ดูแลระบบ</h1></div></div><section class="card"><form id="token-form"><label class="field"><span>รหัสผู้ดูแล</span><input name="token" type="password" autocomplete="off" required></label><button class="btn btn-primary" type="submit">เข้าสู่ระบบ</button><button class="btn btn-outline" type="button" id="clear-token">ออกจากระบบ</button></form></section>';
  wrap.querySelector('#token-form').onsubmit = e => { e.preventDefault(); sessionStorage.setItem('kps_admin_token', e.currentTarget.querySelector('[name="token"]').value.trim()); e.currentTarget.reset(); toast('เข้าสู่ระบบผู้ดูแลแล้ว'); route('home'); };
  wrap.querySelector('#clear-token').onclick = () => { sessionStorage.removeItem('kps_admin_token'); state.links = []; state.dashboard = null; toast('ออกจากระบบแล้ว'); };
  shell(wrap);
}
function renderGuide() {
  const wrap = el('div', 'page settings-page');
  wrap.innerHTML = '<div class="page-heading"><div><div class="eyebrow">HELP</div><h1>คู่มือการใช้งาน</h1><p>เริ่มสร้างและจัดการลิงก์สั้น</p></div></div><section class="card"><h2>สร้างลิงก์และ QR Code</h2><p>1. ไปที่ ตั้งค่าระบบ แล้วใส่รหัสผู้ดูแลจากผู้ดูแลระบบ</p><p>2. เปิดหน้า สร้างลิงก์สั้น วาง URL ที่ขึ้นต้นด้วย http:// หรือ https://</p><p>3. ใส่ชื่อ, ชื่อเฉพาะ และวันหมดอายุหากต้องการ แล้วกดสร้าง</p><p>4. คัดลอก Short URL หรือดาวน์โหลด QR เป็น PNG/SVG</p><h2>จัดการลิงก์</h2><p>เปิด ลิงก์ทั้งหมด เพื่อค้นหา ดูรายละเอียด แก้ปลายทาง หรือปิดใช้งาน QR เดิมยังชี้มาที่ Short URL และจะใช้ปลายทางใหม่หลังแก้ไข</p></section>';
  shell(wrap);
}
async function load(page, code) {
  state.page = page; state.selected = page === 'detail' ? state.links.find(l => l.code === code) || null : state.selected;
  if (page === 'home') renderHome(); if (page === 'links') renderLinks(); if (page === 'detail') renderDetail(); if (page === 'dashboard') renderDashboard(); if (page === 'settings') renderSettings(); if (page === 'guide') renderGuide();
  if (!API || API.includes('YOUR_DEPLOYMENT_ID') || !sessionStorage.getItem('kps_admin_token')) return;
  try {
    if (page === 'home' || page === 'links') {
      const links = await mutate('getLinks', { limit: 500 }); state.links = links;
      if (page === 'home') { state.dashboard = await mutate('getDashboard', {}); if (state.page === 'home') renderHome(); }
      else if (state.page === 'links') renderLinks();
    } else if (page === 'detail') {
      const [link, stats] = await Promise.all([mutate('getLink', { code }), mutate('getStats', { code })]); state.selected = link; state.stats = stats; if (state.page === 'detail') renderDetail();
    } else if (page === 'dashboard') { state.dashboard = await mutate('getDashboard', {}); if (state.page === 'dashboard') renderDashboard(); }
  } catch (e) { toast(e.message, true); }
}
window.addEventListener('hashchange', () => { const r = currentRoute(); load(r.page, r.code); });
window.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); route('links'); setTimeout(() => document.querySelector('#search')?.focus(), 50); } });
function startPublicRedirect(code) {
  app.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;font-family:sans-serif;color:#352750"><p id="redirect-status">กำลังเปิดลิงก์...</p></main>';
  const status = document.querySelector('#redirect-status');
  const callback = '__kpsRedirect';
  const script = document.createElement('script');
  const slowTimer = setTimeout(() => { status.textContent = 'กำลังเริ่มระบบ กรุณารอสักครู่...'; }, 10000);
  const timer = setTimeout(() => { status.textContent = 'เปิดลิงก์ไม่สำเร็จ กรุณาลองใหม่'; script.remove(); }, 45000);
  window[callback] = result => {
    clearTimeout(slowTimer); clearTimeout(timer); script.remove(); delete window[callback];
    if (result?.success && validUrl(result.targetUrl)) location.replace(result.targetUrl);
    else status.textContent = result?.error || 'ไม่พบลิงก์นี้';
  };
  script.onerror = () => { clearTimeout(slowTimer); clearTimeout(timer); status.textContent = 'เชื่อมต่อระบบลิงก์ไม่ได้ กรุณาลองใหม่'; };
  script.src = `${API}?id=${encodeURIComponent(code)}&callback=${callback}`;
  document.head.append(script);
}
const params = new URLSearchParams(location.search);
const redirectCode = params.get('id') || (/^\?[A-Za-z0-9_-]{1,40}$/.test(location.search) ? location.search.slice(1) : '');
if (redirectCode && /^[A-Za-z0-9_-]{1,40}$/.test(redirectCode)) startPublicRedirect(redirectCode);
else { const initial = currentRoute(); load(initial.page, initial.code); }
