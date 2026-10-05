/** Run setup() once, set ADMIN_TOKEN in Script Properties, then deploy as a web app. */
var LINK_HEADERS = ['id', 'code', 'alias', 'target_url', 'title', 'created_at', 'updated_at', 'expires_at', 'status', 'clicks', 'last_clicked_at'];
var LOG_HEADERS = ['timestamp', 'code', 'date', 'hour'];
var BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
var RESERVED = ['admin', 'api', 'dashboard', 'login', 'logout', 'links', 'settings', 'stats', 'health'];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('KPS Link Database');
  ['links', 'click_logs', 'settings'].forEach(function (name) {
    if (!book.getSheetByName(name)) book.insertSheet(name);
  });
  ensureHeader_(book.getSheetByName('links'), LINK_HEADERS);
  book.getSheetByName('links').getRange('B:B').setNumberFormat('@');
  ensureHeader_(book.getSheetByName('click_logs'), LOG_HEADERS);
  ensureHeader_(book.getSheetByName('settings'), ['key', 'value']);
  book.getSheetByName('click_logs').getRange('C:C').setNumberFormat('@');
  var blank = book.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && book.getSheets().length > 3) book.deleteSheet(blank);
  props.setProperty('SPREADSHEET_ID', book.getId());
  if (!props.getProperty('NEXT_ID')) props.setProperty('NEXT_ID', String(Math.max(1, book.getSheetByName('links').getLastRow())));
  if (!props.getProperty('ADMIN_TOKEN')) props.setProperty('ADMIN_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('Spreadsheet: ' + book.getUrl());
  Logger.log('Admin token is in Script Properties. Keep it private.');
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function doGet(e) {
  var p = e && e.parameter || {};
  if (p.id && p.callback === '__kpsRedirect') return redirectJsonp_(p.id);
  if (p.id) return redirect_(p.id);
  return ContentService.createTextOutput('Not found');
}

function redirectJsonp_(code) {
  var result;
  try { result = { success: true, targetUrl: resolveTarget_(code) }; }
  catch (err) { result = { success: false, error: err.code ? err.message : 'เปิดลิงก์ไม่ได้' }; }
  var body = '__kpsRedirect(' + JSON.stringify(result).replace(/</g, '\\u003c') + ');';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  var p = e && e.parameter || {};
  var nonce = String(p.nonce || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  var result;
  try {
    var body = JSON.parse(p.payload || '{}');
    if (p.action !== 'createLink') authorize_(body.token);
    switch (p.action) {
      case 'getLinks': result = ok_(getLinks_(body)); break;
      case 'getLink': result = ok_(getLink_(body.code)); break;
      case 'getStats': result = ok_(getStats_(body.code)); break;
      case 'getDashboard': result = ok_(getDashboard_()); break;
      case 'createLink': rateLimitCreate_(body.clientId); result = ok_(createLink_(body)); break;
      case 'updateLink': result = ok_(updateLink_(body)); break;
      case 'disableLink': result = ok_(setStatus_(body.code, 'disabled')); break;
      case 'enableLink': result = ok_(setStatus_(body.code, 'active')); break;
      default: throw appError_('INVALID_ACTION', 'ไม่พบคำสั่งที่ร้องขอ');
    }
  } catch (err) { result = errorResult_(err); }
  // A hidden form iframe avoids GAS ContentService cross-origin fetch limitations.
  var message = JSON.stringify({ type: 'kps-link-result', nonce: nonce, result: result });
  var html = '<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' + JSON.stringify(message) + ',"*")<\/script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function authorize_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!expected || !token || String(token) !== expected) throw appError_('UNAUTHORIZED', 'รหัสผู้ดูแลไม่ถูกต้อง');
}
function rateLimitCreate_(clientId) {
  var id = String(clientId || '');
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) throw appError_('INVALID_CLIENT', 'กรุณาโหลดหน้าเว็บใหม่แล้วลองอีกครั้ง');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id, Utilities.Charset.UTF_8);
  var clientKey = 'create:c:' + Utilities.base64EncodeWebSafe(digest).slice(0, 32) + ':' + Math.floor(Date.now() / 600000);
  var globalKey = 'create:g:' + Math.floor(Date.now() / 3600000);
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock(); lock.waitLock(5000);
  try {
    var clientCount = Number(cache.get(clientKey) || 0);
    var globalCount = Number(cache.get(globalKey) || 0);
    if (clientCount >= 60) throw appError_('RATE_LIMITED', 'สร้างลิงก์ได้ไม่เกิน 60 ครั้งต่อ 10 นาที กรุณารอสักครู่');
    if (globalCount >= 100) throw appError_('RATE_LIMITED', 'ระบบมีการใช้งานจำนวนมาก กรุณาลองใหม่ภายหลัง');
    cache.put(clientKey, String(clientCount + 1), 660);
    cache.put(globalKey, String(globalCount + 1), 3660);
  } finally { lock.releaseLock(); }
}
function ok_(data) { return { success: true, data: data }; }
function appError_(code, message) { var e = new Error(message); e.code = code; return e; }
function errorResult_(err) { return { success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.code ? err.message : 'ระบบขัดข้อง กรุณาลองอีกครั้ง' } }; }
function book_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw appError_('NOT_CONFIGURED', 'กรุณารัน setup() ก่อน');
  return SpreadsheetApp.openById(id);
}
function linksSheet_() { return book_().getSheetByName('links'); }
function isUrl_(value) { return /^https?:\/\/(?:[A-Za-z0-9_-]+\.)*[A-Za-z0-9_-]+(?::\d{1,5})?(?:[/?#]|$)/i.test(String(value || '')) && !/[\s\\]/.test(String(value)); }
function url_(value) {
  var v = String(value || '').trim();
  if (!isUrl_(v) || v.length > 4000 || /[\u0000-\u001f]/.test(v)) throw appError_('INVALID_URL', 'กรุณาใช้ลิงก์ http หรือ https ที่ถูกต้อง');
  return v;
}
function publicUrl_(value) {
  var v = url_(value);
  var authority = ((v.match(/^https?:\/\/([^\/?#]*)/i) || [])[1] || '');
  if (authority.indexOf('@') !== -1) throw appError_('UNSAFE_URL', 'ไม่อนุญาตลิงก์ที่มีข้อมูลเข้าสู่ระบบ');
  var host = authority.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  var privateHost = host === 'localhost' || /\.local$/.test(host) || /^(?:0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || host === '::1';
  if (privateHost) throw appError_('UNSAFE_URL', 'ไม่อนุญาตลิงก์ภายในหรือที่อยู่เครือข่ายส่วนตัว');
  return v;
}
function alias_(value) {
  var v = String(value || '').trim();
  if (v && (!/^[A-Za-z0-9_-]{3,40}$/.test(v) || RESERVED.indexOf(v.toLowerCase()) !== -1)) throw appError_('INVALID_ALIAS', 'ชื่อเฉพาะต้องมี 3–40 ตัว ใช้ตัวอักษร ตัวเลข - หรือ _');
  return v;
}
function expiry_(value) {
  if (!value) return '';
  var date = new Date(value);
  if (isNaN(date.getTime()) || date.getTime() <= Date.now()) throw appError_('INVALID_EXPIRY', 'วันหมดอายุต้องเป็นวันในอนาคต');
  return date.toISOString();
}
function encode62_(n) {
  var s = '';
  do { s = BASE62[n % 62] + s; n = Math.floor(n / 62); } while (n > 0);
  return s;
}
function rowFor_(code) {
  var sheet = linksSheet_();
  var last = sheet.getLastRow();
  var requested = String(code || '');
  if (last < 2 || !/^[A-Za-z0-9_-]{1,40}$/.test(requested)) return null;
  var codeRange = sheet.getRange(2, 2, last - 1, 1);
  var hit = codeRange.createTextFinder(requested).matchEntireCell(true).matchCase(true).findNext();
  var row = hit && hit.getRow();
  if (!row && /^\d+$/.test(requested)) {
    var compact = requested.replace(/^0+(?=\d)/, '');
    var codes = codeRange.getDisplayValues();
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0]).replace(/^0+(?=\d)/, '') === compact) { row = i + 2; break; }
    }
  }
  if (!row) return null;
  return { sheet: sheet, row: row, values: sheet.getRange(row, 1, 1, LINK_HEADERS.length).getValues()[0] };
}
function toLink_(v) {
  var expires = v[7] ? String(v[7]) : '';
  return { id: Number(v[0]), code: String(v[1]), alias: String(v[2] || ''), targetUrl: String(v[3]), title: String(v[4] || ''), createdAt: String(v[5]), updatedAt: String(v[6]), expiresAt: expires, status: String(v[8]) === 'disabled' ? 'disabled' : expires && new Date(expires).getTime() <= Date.now() ? 'expired' : 'active', clicks: Number(v[9]) || 0, lastClickedAt: String(v[10] || ''), shortUrl: shortUrl_(String(v[1])) };
}
function shortUrl_(code) {
  var base = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL') || ScriptApp.getService().getUrl();
  return base ? base + '?id=' + encodeURIComponent(code) : '';
}
function createLink_(body) {
  var target = publicUrl_(body.targetUrl), alias = alias_(body.alias), expires = expiry_(body.expiresAt);
  var title = String(body.title || '').trim().slice(0, 180);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet = linksSheet_();
    if (alias && rowFor_(alias)) throw appError_('ALIAS_EXISTS', 'ชื่อเฉพาะนี้มีผู้ใช้แล้ว');
    var props = PropertiesService.getScriptProperties();
    var id = Number(props.getProperty('NEXT_ID') || sheet.getLastRow());
    var code = alias || encode62_(id);
    while (rowFor_(code)) { id++; code = alias || encode62_(id); if (alias) throw appError_('ALIAS_EXISTS', 'ชื่อเฉพาะนี้มีผู้ใช้แล้ว'); }
    var now = new Date().toISOString();
    var values = [id, code, alias, target, title || target, now, now, expires, 'active', 0, ''];
    sheet.appendRow(values);
    props.setProperty('NEXT_ID', String(id + 1));
    return toLink_(values);
  } finally { lock.releaseLock(); }
}
function getLinks_(p) {
  var sheet = linksSheet_(), last = sheet.getLastRow();
  if (last < 2) return [];
  var limit = Math.min(500, Math.max(1, Number(p.limit) || 200));
  var start = Math.max(2, last - limit + 1);
  return sheet.getRange(start, 1, last - start + 1, LINK_HEADERS.length).getValues().reverse().map(toLink_);
}
function getLink_(code) {
  var found = rowFor_(code);
  if (!found) throw appError_('LINK_NOT_FOUND', 'ไม่พบลิงก์นี้');
  return toLink_(found.values);
}
function updateLink_(body) {
  var target = url_(body.targetUrl), expires = expiry_(body.expiresAt), title = String(body.title || '').trim().slice(0, 180);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var found = rowFor_(body.code);
    if (!found) throw appError_('LINK_NOT_FOUND', 'ไม่พบลิงก์นี้');
    var v = found.values;
    v[3] = target; v[4] = title || target; v[6] = new Date().toISOString(); v[7] = expires;
    found.sheet.getRange(found.row, 1, 1, LINK_HEADERS.length).setValues([v]);
    CacheService.getScriptCache().remove('link:' + v[1]);
    return toLink_(v);
  } finally { lock.releaseLock(); }
}
function setStatus_(code, status) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var found = rowFor_(code);
    if (!found) throw appError_('LINK_NOT_FOUND', 'ไม่พบลิงก์นี้');
    found.values[8] = status; found.values[6] = new Date().toISOString();
    found.sheet.getRange(found.row, 1, 1, LINK_HEADERS.length).setValues([found.values]);
    CacheService.getScriptCache().remove('link:' + code);
    return toLink_(found.values);
  } finally { lock.releaseLock(); }
}

function redirect_(code) {
  try {
    var target = resolveTarget_(code);
    var safe = String(target).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var scriptUrl = JSON.stringify(target).replace(/</g, '\\u003c');
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=' + safe + '"><script>location.replace(' + scriptUrl + ')<\/script><a href="' + safe + '">เปิดลิงก์</a>');
  } catch (err) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:2rem">' + (err.code ? err.message : 'เปิดลิงก์ไม่ได้') + '</p>');
  }
}
function resolveTarget_(code) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('link:' + code);
  var link = cached ? JSON.parse(cached) : getLink_(code);
  if (!cached) cache.put('link:' + code, JSON.stringify(link), 21600);
  if (link.status === 'disabled') throw appError_('LINK_DISABLED', 'ลิงก์นี้ถูกปิดใช้งาน');
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) throw appError_('LINK_EXPIRED', 'ลิงก์นี้หมดอายุแล้ว');
  if (!isUrl_(link.targetUrl)) throw appError_('INVALID_URL', 'ปลายทางไม่ถูกต้อง');
  try { trackClick_(code); } catch (ignore) { /* redirect still works if analytics fails */ }
  return link.targetUrl;
}
function trackClick_(code) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var found = rowFor_(code); if (!found) return;
    var now = new Date(), iso = now.toISOString();
    found.sheet.getRange(found.row, 10, 1, 2).setValues([[Number(found.values[9] || 0) + 1, iso]]);
    var tz = Session.getScriptTimeZone();
    book_().getSheetByName('click_logs').appendRow([iso, code, Utilities.formatDate(now, tz, 'yyyy-MM-dd'), Utilities.formatDate(now, tz, 'HH')]);
  } finally { lock.releaseLock(); }
}
function dailyCounts_(code) {
  var sheet = book_().getSheetByName('click_logs'), last = sheet.getLastRow(), map = {};
  if (last < 2) return map;
  sheet.getRange(2, 1, last - 1, 4).getDisplayValues().forEach(function (v) {
    if (!code || String(v[1]) === code) { var day = String(v[2]); map[day] = (map[day] || 0) + 1; }
  });
  return map;
}
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function getStats_(code) {
  var link = getLink_(code), daily = dailyCounts_(code);
  return { totalClicks: link.clicks, todayClicks: daily[today_()] || 0, lastClickedAt: link.lastClickedAt, daily: daily };
}
function getDashboard_() {
  var sheet = linksSheet_(), last = sheet.getLastRow();
  var links = last < 2 ? [] : sheet.getRange(2, 1, last - 1, LINK_HEADERS.length).getValues().map(toLink_);
  var daily = dailyCounts_();
  return { totalLinks: links.length, activeLinks: links.filter(function (v) { return v.status === 'active'; }).length, totalClicks: links.reduce(function (n, v) { return n + v.clicks; }, 0), todayClicks: daily[today_()] || 0, daily: daily, topLinks: links.sort(function (a, b) { return b.clicks - a.clicks; }).slice(0, 5) };
}
