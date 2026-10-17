/* Sổ Truyện — sổ viết truyện riêng tư.
   Chữ và ảnh đều được mã hoá AES-256-GCM bằng khoá sinh từ mật khẩu (PBKDF2-SHA256)
   và chỉ lưu trong IndexedDB trên chính thiết bị này. Ứng dụng không gửi dữ liệu đi đâu. */
(function(){
"use strict";

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2,"0")).join("");
const countWords = t => { t = (t||"").trim(); return t ? t.split(/\s+/).length : 0; };
const fmtN = n => (n||0).toLocaleString("vi-VN");
const now = () => Date.now();
function ago(ts){
  if(!ts) return "";
  const d = (now()-ts)/1000;
  if(d < 60) return "vừa xong";
  if(d < 3600) return Math.floor(d/60) + " phút trước";
  if(d < 86400) return Math.floor(d/3600) + " giờ trước";
  if(d < 86400*7) return Math.floor(d/86400) + " ngày trước";
  return new Date(ts).toLocaleDateString("vi-VN");
}
const ls = {
  get(k, f){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; }catch(e){ return f; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
const fold = s => s.normalize("NFC").split("").map(ch => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().charAt(0) || " ").join("");
const SVG = (p, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const ICON = {
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  chev: SVG('<path d="M9 6l6 6-6 6"/>', 'width="18" height="18"'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>', 'width="18" height="18" stroke-width="2.2"'),
  lock: SVG('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  image: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  center: SVG('<path d="M5 6h14M8 10h8M5 14h14M8 18h8"/>'),
  book: SVG('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
  undo: SVG('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: SVG('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  up: SVG('<path d="M12 19V5M6 11l6-6 6 6"/>', 'width="18" height="18"'),
  down: SVG('<path d="M12 5v14M6 13l6 6 6-6"/>', 'width="18" height="18"'),
  trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 'width="18" height="18"')
};
function setBar(html){ $("#bar").innerHTML = html; }
function resetMain(){ const m = $("#main"); m.className = ""; return m; }

/* ---------- encryption ---------- */
const TE = new TextEncoder(), TD = new TextDecoder();
const b64 = buf => { const a = new Uint8Array(buf); let s = ""; for(let i=0;i<a.length;i+=0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i+0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 1000000, CHECK = "sotruyen-ok";
let KEY = null;
async function deriveKey(pw, salt, iter){
  const base = await crypto.subtle.importKey("raw", TE.encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:iter, hash:"SHA-256"}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
}
async function sealBytes(bytes, key = KEY){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
async function unsealBytes(buf, key = KEY){
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM", iv:a.subarray(0,12)}, key, a.subarray(12)));
}
const seal = async (obj, key = KEY) => b64(await sealBytes(TE.encode(JSON.stringify(obj)), key));
const unseal = async (s, key = KEY) => JSON.parse(TD.decode(await unsealBytes(unb64(s), key)));
async function makeVault(pw){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pw, salt, ITER);
  return {key, vault:{v:1, salt:b64(salt), iter:ITER, check: await seal(CHECK, key), createdAt:now()}};
}
async function openVault(pw, vault){
  const key = await deriveKey(pw, unb64(vault.salt), vault.iter || ITER);
  try{ if((await unseal(vault.check, key)) === CHECK) return key; }catch(e){}
  return null;
}
const sealStory = (s, key = KEY) => seal({title:s.title||"", notes:s.notes||""}, key).then(enc => ({id:s.id, enc, createdAt:s.createdAt, updatedAt:s.updatedAt}));
const sealChapter = (c, key = KEY) => seal({title:c.title||"", body:c.body||"", fmt:"html"}, key).then(enc => ({id:c.id, sid:c.sid, enc, order:c.order, createdAt:c.createdAt, updatedAt:c.updatedAt}));

/* ---------- local database (IndexedDB, only on this device) ---------- */
let idb = null;
function openDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open("sotruyen", 2);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if(!has("meta")) d.createObjectStore("meta");
      if(!has("stories")) d.createObjectStore("stories", {keyPath:"id"});
      if(!has("chapters")) d.createObjectStore("chapters", {keyPath:"id"}).createIndex("sid", "sid");
      if(!has("images")) d.createObjectStore("images", {keyPath:"id"}).createIndex("sid", "sid");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function req(r){ return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
const DB = {
  get(store, key){ return req(idb.transaction(store).objectStore(store).get(key)); },
  all(store){ return req(idb.transaction(store).objectStore(store).getAll()); },
  keys(store){ return req(idb.transaction(store).objectStore(store).getAllKeys()); },
  write(ops){
    if(!ops.length) return Promise.resolve();
    const stores = [...new Set(ops.map(o => o.store))];
    return new Promise((res, rej) => {
      const t = idb.transaction(stores, "readwrite");
      ops.forEach(o => {
        const s = t.objectStore(o.store);
        if(o.op === "put") o.key !== undefined ? s.put(o.value, o.key) : s.put(o.value);
        else if(o.op === "del") s.delete(o.key);
        else if(o.op === "clear") s.clear();
      });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error("aborted"));
    });
  }
};

/* ---------- story text format: a small, safe subset of HTML ---------- */
const INLINE = {STRONG:"strong", B:"strong", EM:"em", I:"em", U:"u"};
const DROP = new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","TEMPLATE","SVG","MATH","NOSCRIPT","IMG","VIDEO","AUDIO","BUTTON","INPUT","SELECT","TEXTAREA","HEAD","TITLE","META","LINK"]);
const BLOCKISH = "figure,hr,p,div,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,li,section,article";
function cleanHTML(html){
  const src = new DOMParser().parseFromString("<!doctype html><body>" + (html || "") + "</body>", "text/html").body;
  const out = document.createElement("div");
  let cur = null;
  function inlineInto(nodes, parent){
    for(const n of nodes){
      if(n.nodeType === 3){ parent.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if(n.nodeType !== 1 || DROP.has(n.tagName) || n.tagName === "FIGURE" || n.tagName === "HR") continue;
      if(n.classList && n.classList.contains("figbar")) continue;
      if(n.tagName === "BR"){ parent.appendChild(document.createElement("br")); continue; }
      const t = INLINE[n.tagName];
      if(t){ const e = document.createElement(t); inlineInto(n.childNodes, e); if(e.childNodes.length) parent.appendChild(e); }
      else inlineInto(n.childNodes, parent);
    }
  }
  function para(tag){ cur = document.createElement(tag); out.appendChild(cur); return cur; }
  function walk(nodes, as){
    for(const n of nodes){
      if(n.nodeType === 3){
        if(!cur && !n.nodeValue.trim()) continue;
        (cur || para(as)).appendChild(document.createTextNode(n.nodeValue));
        continue;
      }
      if(n.nodeType !== 1 || DROP.has(n.tagName)) continue;
      const tag = n.tagName;
      if(tag === "FIGURE"){
        cur = null;
        const id = n.getAttribute("data-img") || "";
        if(!/^[a-z0-9]{6,40}$/i.test(id)) continue;
        const f = document.createElement("figure");
        f.className = "img"; f.setAttribute("data-img", id);
        const sz = n.getAttribute("data-size");
        f.setAttribute("data-size", ["s","m","l"].includes(sz) ? sz : "l");
        const cap = n.querySelector("figcaption"), fc = document.createElement("figcaption");
        if(cap) fc.textContent = cap.textContent.replace(/\s+/g, " ").trim();
        f.appendChild(fc); out.appendChild(f);
        continue;
      }
      if(tag === "HR"){ cur = null; out.appendChild(document.createElement("hr")); continue; }
      if(/^(P|DIV|H[1-6]|BLOCKQUOTE|LI|UL|OL|SECTION|ARTICLE)$/.test(tag)){
        const kind = /^H[1-6]$/.test(tag) ? "h3" : tag === "BLOCKQUOTE" ? "blockquote" : (as || "p");
        if(n.querySelector(BLOCKISH)){ cur = null; walk(n.childNodes, kind === "h3" ? "p" : kind); cur = null; continue; }
        if(tag === "UL" || tag === "OL"){ cur = null; walk(n.childNodes, as); cur = null; continue; }
        cur = null;
        const e = document.createElement(kind);
        const al = (n.style && n.style.textAlign) || n.getAttribute("align") || "";
        if(al === "center" || al === "right") e.style.textAlign = al;
        inlineInto(n.childNodes, e);
        if(!e.textContent.length && !e.querySelector("br")) e.appendChild(document.createElement("br"));
        out.appendChild(e); cur = null;
        continue;
      }
      if(tag === "BR"){ (cur || para(as)).appendChild(document.createElement("br")); continue; }
      inlineInto([n], cur || para(as));
    }
  }
  walk(src.childNodes, "p");
  return out.innerHTML;
}
function textToHTML(t){
  const lines = String(t || "").replace(/\r/g, "").split("\n").filter(l => l.trim());
  return lines.length ? lines.map(l => `<p>${esc(l)}</p>`).join("") : "<p><br></p>";
}
function htmlBlocks(html){
  const d = document.createElement("div"); d.innerHTML = cleanHTML(html);
  return Array.from(d.children);
}
function plainText(html, withImages = true){
  return htmlBlocks(html).map(b => {
    if(b.tagName === "HR") return "* * *";
    if(b.tagName === "FIGURE"){ const c = b.textContent.trim(); return withImages ? `[Ảnh${c ? ": " + c : ""}]` : ""; }
    return b.textContent;
  }).filter(s => s !== "").join("\n\n");
}
const textCache = new WeakMap();
function chText(c){ if(!textCache.has(c)) textCache.set(c, plainText(c.body, false)); return textCache.get(c); }
const chWords = c => countWords(chText(c));
const imageIds = html => Array.from(String(html || "").matchAll(/data-img="([a-z0-9]+)"/gi), m => m[1]);

/* ---------- state (only filled while unlocked) ---------- */
let vault = null;
const stories = new Map();   // id -> {id,title,notes,createdAt,updatedAt}
const chapters = new Map();  // id -> {id,sid,title,body(html),order,createdAt,updatedAt}
const imgURL = new Map();    // image id -> blob: URL (decrypted, in memory only)
let view = {name:"boot"};
let fontSize = ls.get("sotruyen.fs", 18);

const storyChapters = sid => [...chapters.values()].filter(c => c.sid === sid).sort((a,b) => (a.order||0)-(b.order||0) || (a.createdAt||0)-(b.createdAt||0));
const storyWords = sid => storyChapters(sid).reduce((a,c) => a + chWords(c), 0);
const sortedStories = () => [...stories.values()].sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0));

async function saveStory(s){ await DB.write([{store:"stories", op:"put", value: await sealStory(s)}]); }
async function saveChapter(c){ await DB.write([{store:"chapters", op:"put", value: await sealChapter(c)}]); }
function touchStory(sid, t){ const s = stories.get(sid); if(!s) return; s.updatedAt = t; saveStory(s).catch(()=>{}); }

async function imageURL(id){
  if(imgURL.has(id)) return imgURL.get(id);
  const r = await DB.get("images", id);
  if(!r || !KEY) return null;
  const bytes = await unsealBytes(r.enc);
  const url = URL.createObjectURL(new Blob([bytes], {type:r.type || "image/jpeg"}));
  imgURL.set(id, url);
  return url;
}
async function imageDataURL(id){
  const r = await DB.get("images", id); if(!r) return null;
  return `data:${r.type || "image/jpeg"};base64,` + b64(await unsealBytes(r.enc));
}
// Remove image records no chapter refers to any more.
async function cleanupImages(){
  try{
    const used = new Set(); for(const c of chapters.values()) imageIds(c.body).forEach(i => used.add(i));
    const keys = await DB.keys("images");
    const ops = keys.filter(k => !used.has(k)).map(k => ({store:"images", op:"del", key:k}));
    ops.forEach(o => { const u = imgURL.get(o.key); if(u){ URL.revokeObjectURL(u); imgURL.delete(o.key); } });
    await DB.write(ops);
  }catch(e){}
}

/* ---------- boot ---------- */
async function boot(){
  if(!(window.crypto && crypto.subtle && window.indexedDB)) return fatal("Trình duyệt này không hỗ trợ mã hoá hoặc lưu trữ. Hãy mở bằng Safari trên iOS 15 trở lên.");
  try{ idb = await openDB(); vault = await DB.get("meta", "vault") || null; }
  catch(e){ return fatal("Không mở được nơi lưu trữ trên máy. Nếu bạn đang dùng chế độ Duyệt web riêng tư, hãy tắt nó rồi mở lại."); }
  renderLock(vault ? "unlock" : "create");
}
function fatal(msg){
  setBar(`<div class="brand grow">Sổ <i>Truyện</i></div>`);
  resetMain().innerHTML = `<div class="col"><div class="empty"><span class="big">Chưa mở được sổ</span><p>${esc(msg)}</p></div></div>`;
}

/* ---------- lock screen ---------- */
function pwProblem(p){
  if(p.length < 10) return "Mật khẩu cần ít nhất 10 ký tự.";
  if(!/\p{L}/u.test(p) || !/\d/.test(p)) return "Mật khẩu cần có cả chữ và số.";
  if(/^(.)\1+$/.test(p) || /^(0123456789|1234567890|matkhau|password)/i.test(p)) return "Mật khẩu này quá dễ đoán, hãy chọn cái khác.";
  return "";
}
function failDelay(){
  const f = ls.get("sotruyen.fails", {n:0, at:0});
  if(f.n < 3) return 0;
  return Math.max(0, f.at + Math.min(60000, 2000 * Math.pow(2, f.n - 3)) - now());
}
const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);

function renderLock(mode){
  view = {name:"lock"}; KEY = null;
  const create = mode === "create";
  setBar(`<div class="brand grow">Sổ <i>Truyện</i></div>`);
  const hint = !create || isStandalone() ? "" :
    `<p class="note">Mẹo: hãy “Thêm vào MH chính” trước rồi mở từ biểu tượng để đặt mật khẩu. Ứng dụng ngoài màn hình chính và trang trong Safari dùng hai kho lưu riêng.</p>`;
  resetMain().innerHTML = `<div class="col" style="padding-top:36px">
    <div class="lock-mark">${ICON.lock}</div>
    <div class="stack-6">
      <span class="eyebrow">${create ? "Lần đầu sử dụng" : "Sổ đang khoá"}</span>
      <h1>${create ? "Đặt mật khẩu cho sổ" : "Nhập mật khẩu để mở sổ"}</h1>
      ${create ? `<p class="sub">Truyện và ảnh được mã hoá bằng mật khẩu này và chỉ nằm trên máy bạn. Không có máy chủ nào giữ truyện hay mật khẩu.</p>` : ""}
    </div>
    <form id="f" class="form" novalidate>
      <div class="field"><label for="pw">Mật khẩu</label>
        <input id="pw" type="password" autocomplete="${create ? "new-password" : "current-password"}" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      ${create ? `<div class="field"><label for="pw2">Nhập lại mật khẩu</label>
        <input id="pw2" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"></div>` : ""}
      <label class="check"><input type="checkbox" id="show"> Hiện mật khẩu</label>
      ${create ? `<div class="notice"><strong>Quên mật khẩu là mất truyện.</strong> Không có cách nào lấy lại, nên hãy ghi mật khẩu ra chỗ an toàn. Cần ít nhất 10 ký tự, có cả chữ và số. Một câu ngắn chỉ bạn biết là dễ nhớ và khó đoán.
        <label class="check"><input type="checkbox" id="ack"> Mình đã hiểu và đã ghi lại mật khẩu</label></div>` : ""}
      <p class="err" id="err" hidden></p>
      <button class="primary" id="go" type="submit">${create ? "Tạo khoá và bắt đầu" : "Mở sổ"}</button>
      ${create ? "" : `<button class="linkbtn" type="button" id="forgot">Quên mật khẩu?</button>`}
    </form>
    ${hint}
    <div id="forgotBox"></div>
  </div>`;
  const pw = $("#pw"), pw2 = $("#pw2"), err = $("#err"), go = $("#go");
  const label = go.textContent;
  $("#show").onchange = e => { const t = e.target.checked ? "text" : "password"; pw.type = t; if(pw2) pw2.type = t; };
  const fail = m => { err.textContent = m; err.hidden = false; go.disabled = false; go.textContent = label; };
  $("#f").addEventListener("submit", async e => {
    e.preventDefault(); err.hidden = true;
    const p = pw.value;
    if(create){
      const weak = pwProblem(p); if(weak) return fail(weak);
      if(p !== pw2.value) return fail("Hai lần nhập mật khẩu chưa khớp.");
      if(!$("#ack").checked) return fail("Hãy đánh dấu ô xác nhận phía trên.");
      go.disabled = true; go.textContent = "Đang tạo khoá…";
      try{
        const {key, vault:v} = await makeVault(p);
        await DB.write([{store:"meta", op:"put", value:v, key:"vault"}]);
        vault = v; KEY = key;
      }catch(ex){ return fail("Chưa tạo được khoá. Thử lại nhé."); }
    } else {
      if(!p) return fail("Hãy nhập mật khẩu.");
      const wait = failDelay();
      if(wait > 0) return fail(`Nhập sai nhiều lần. Đợi ${Math.ceil(wait/1000)} giây rồi thử lại.`);
      go.disabled = true; go.textContent = "Đang mở…";
      let key = null;
      try{ key = await openVault(p, vault); }catch(ex){}
      if(!key){
        const f = ls.get("sotruyen.fails", {n:0, at:0}); ls.set("sotruyen.fails", {n:f.n+1, at:now()});
        return fail("Sai mật khẩu. Thử lại nhé.");
      }
      ls.set("sotruyen.fails", {n:0, at:0});
      KEY = key;
    }
    pw.value = ""; if(pw2) pw2.value = "";
    await afterUnlock();
  });
  if($("#forgot")) $("#forgot").onclick = renderForgot;
  setTimeout(() => pw.focus(), 60);
}

function renderForgot(){
  $("#forgotBox").innerHTML = `<div class="box danger">
    <p><strong>Không có cách lấy lại mật khẩu.</strong> Truyện được mã hoá bằng chính mật khẩu đó, nên không ai mở được nếu thiếu nó.</p>
    <p>Bạn có thể xoá sạch sổ trên máy này để đặt mật khẩu mới. Toàn bộ truyện hiện có sẽ mất. Nếu có file sao lưu, sau này bạn vẫn khôi phục được nếu nhớ ra mật khẩu của file đó.</p>
    <div class="field"><label for="wipeTxt">Gõ chữ XOA để xác nhận</label><input id="wipeTxt" autocomplete="off" autocapitalize="characters"></div>
    <div class="row"><button class="ghost danger" id="wipe">Xoá sạch sổ</button></div></div>`;
  $("#wipe").onclick = async () => {
    if($("#wipeTxt").value.trim().toUpperCase() !== "XOA") return toast("Hãy gõ đúng chữ XOA.");
    await DB.write(["meta","stories","chapters","images"].map(s => ({store:s, op:"clear"})));
    vault = null; ls.set("sotruyen.fails", {n:0, at:0});
    toast("Đã xoá sạch sổ."); renderLock("create");
  };
}

async function afterUnlock(){
  resetMain().innerHTML = `<div class="loading">Đang mở sổ…</div>`;
  stories.clear(); chapters.clear();
  try{
    const [rs, rc] = await Promise.all([DB.all("stories"), DB.all("chapters")]);
    for(const r of rs){
      let m = {title:"(không mở được)"}; try{ m = await unseal(r.enc); }catch(e){}
      stories.set(r.id, {id:r.id, title:m.title, notes:m.notes || "", createdAt:r.createdAt, updatedAt:r.updatedAt});
    }
    for(const r of rc){
      let m = {title:"(không mở được)", body:""}; try{ m = await unseal(r.enc); }catch(e){}
      const body = m.fmt === "html" ? m.body : textToHTML(m.body);
      chapters.set(r.id, {id:r.id, sid:r.sid, title:m.title, body, order:r.order, createdAt:r.createdAt, updatedAt:r.updatedAt});
    }
  }catch(e){ return fatal("Không đọc được dữ liệu trên máy. Hãy tải lại ứng dụng."); }
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  cleanupImages();
  renderLibrary();
}

async function lock(){
  try{ await flush(); }catch(e){}
  ed = null; KEY = null;
  stories.clear(); chapters.clear();
  imgURL.forEach(u => URL.revokeObjectURL(u)); imgURL.clear();
  renderLock("unlock");
}

/* ---------- library + search ---------- */
function renderLibrary(){
  view = {name:"library"};
  setBar(`<div class="brand grow">Sổ <i>Truyện</i></div>
    <button class="iconbtn" id="setBtn" aria-label="Cài đặt và sao lưu">${ICON.gear}</button>
    <button class="iconbtn" id="lockBtn" aria-label="Khoá sổ">${ICON.lock}</button>`);
  $("#lockBtn").onclick = lock;
  $("#setBtn").onclick = renderSettings;
  const list = sortedStories();
  const total = list.reduce((a,s) => a + storyWords(s.id), 0);
  const last = [...chapters.values()].sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0))[0];
  const lastBackup = ls.get("sotruyen.lastBackup", 0);
  let html = `<div class="col">
    <div class="stack-4">
      <span class="eyebrow">Tủ truyện · đã mã hoá trên máy</span>
      <h1>${list.length ? `${list.length} truyện · ${fmtN(total)} chữ` : "Chưa có truyện nào"}</h1></div>
    <div class="row"><button class="primary" id="newStory">${ICON.plus} Viết truyện mới</button>
      ${last && stories.has(last.sid) ? `<button class="ghost" id="resume">Viết tiếp “${esc(last.title || "chương gần nhất")}”</button>` : ""}</div>`;
  if(!list.length){
    html += `<div class="empty"><span class="big">Trang giấy đang chờ bạn.</span>
      <p>Bấm “Viết truyện mới”, đặt tên và bắt đầu gõ. Bạn có thể chèn ảnh vào bất cứ chỗ nào trong truyện. Mọi thứ được mã hoá và lưu ngay trên máy.</p></div>`;
  } else {
    html += `<div class="search"><span aria-hidden="true">${ICON.search}</span><input id="q" type="search" placeholder="Tìm trong tất cả truyện…" autocomplete="off" aria-label="Tìm trong truyện"></div>
      <div id="results" hidden></div>
      <div class="list" id="storyList">` + list.map(s => {
        const n = storyChapters(s.id).length;
        return `<button class="item" data-open="${esc(s.id)}">
          <span class="txt"><span class="t">${esc(s.title || "Truyện chưa đặt tên")}</span>
          <span class="m">${n} chương · ${fmtN(storyWords(s.id))} chữ · sửa ${ago(s.updatedAt)}</span></span>
          <span class="chev">${ICON.chev}</span></button>`;
      }).join("") + `</div>`;
    const stale = !lastBackup || now() - lastBackup > 7*86400000;
    if(stale) html += `<div class="box"><p>${lastBackup ? `Lần sao lưu gần nhất: ${ago(lastBackup)}.` : "Bạn chưa sao lưu lần nào."} Truyện chỉ nằm trên máy này, nên hãy lưu một bản sao (vẫn được mã hoá) vào Tệp hoặc iCloud.</p>
      <div class="row"><button class="ghost" id="quickBackup">Sao lưu ngay</button></div></div>`;
  }
  html += `<p class="note">Sổ tự khoá khi bạn rời ứng dụng hoặc tắt màn hình quá 10 phút. Bấm ổ khoá để khoá ngay.</p></div>`;
  resetMain().innerHTML = html;
  $("#newStory").onclick = newStory;
  if($("#resume")) $("#resume").onclick = () => openEditor(last.id);
  if($("#quickBackup")) $("#quickBackup").onclick = backup;
  $$("[data-open]").forEach(b => b.onclick = () => renderStory(b.dataset.open));
  if($("#q")){ let qT; $("#q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => runSearch(e.target.value), 200); }); }
}

function runSearch(q){
  const box = $("#results"), listEl = $("#storyList");
  q = q.trim();
  if(q.length < 2){ box.hidden = true; listEl.hidden = false; return; }
  const fq = fold(q), hits = [];
  for(const s of sortedStories()){
    if(fold(s.title || "").includes(fq)) hits.push({kind:"story", s});
    for(const c of storyChapters(s.id)){
      const t = (c.title || "") + "\n" + chText(c), ft = fold(t);
      const i = ft.indexOf(fq);
      if(i < 0) continue;
      const a = Math.max(0, i - 40), b = Math.min(t.length, i + fq.length + 60);
      hits.push({kind:"ch", s, c, snip:(a ? "…" : "") + esc(t.slice(a, i)) + "<mark>" + esc(t.slice(i, i + fq.length)) + "</mark>" + esc(t.slice(i + fq.length, b)) + (b < t.length ? "…" : "")});
      if(hits.length > 40) break;
    }
  }
  listEl.hidden = true; box.hidden = false;
  box.innerHTML = hits.length ? `<p class="sub">${hits.length > 40 ? "Hơn 40" : hits.length} kết quả</p><div class="list">` + hits.map(h => h.kind === "story"
    ? `<button class="item" data-open="${esc(h.s.id)}"><span class="txt"><span class="t">${esc(h.s.title || "Truyện chưa đặt tên")}</span><span class="m">Tên truyện</span></span><span class="chev">${ICON.chev}</span></button>`
    : `<button class="item" data-edit="${esc(h.c.id)}"><span class="txt"><span class="m">${esc(h.s.title || "Truyện chưa đặt tên")} · ${esc(h.c.title || "Chương không tên")}</span><span class="snip">${h.snip.replace(/\n+/g, " ")}</span></span><span class="chev">${ICON.chev}</span></button>`
  ).join("") + `</div>` : `<p class="sub">Không tìm thấy “${esc(q)}”.</p>`;
  box.querySelectorAll("[data-open]").forEach(b => b.onclick = () => renderStory(b.dataset.open));
  box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditor(b.dataset.edit));
}

async function newStory(){
  const t = now();
  const s = {id:uid(), title:"", notes:"", createdAt:t, updatedAt:t};
  const c = {id:uid(), sid:s.id, title:"Chương 1", body:"<p><br></p>", order:1, createdAt:t, updatedAt:t};
  try{ await DB.write([{store:"stories", op:"put", value: await sealStory(s)}, {store:"chapters", op:"put", value: await sealChapter(c)}]); }
  catch(e){ return toast("Chưa tạo được truyện. Bộ nhớ máy có thể đã đầy."); }
  stories.set(s.id, s); chapters.set(c.id, c);
  renderStory(s.id, {focusTitle:true});
}

/* ---------- story ---------- */
function renderStory(sid, opt = {}){
  const s = stories.get(sid); if(!s) return renderLibrary();
  view = {name:"story", sid, arrange:!!opt.arrange};
  setBar(`<button class="iconbtn" id="back" aria-label="Về tủ truyện">${ICON.back}</button><div class="grow"></div>
    <button class="iconbtn" id="readBtn" aria-label="Đọc truyện">${ICON.book}</button>
    <button class="iconbtn" id="lockBtn" aria-label="Khoá sổ">${ICON.lock}</button>`);
  const list = storyChapters(sid);
  const delC = opt.confirmCh ? chapters.get(opt.confirmCh) : null;
  let html = `<div class="col">
    <div class="stack-4">
      <label class="eyebrow" for="storyTitle">Tên truyện</label>
      <input id="storyTitle" class="title-input" placeholder="Đặt tên cho truyện…" value="${esc(s.title)}" maxlength="200" autocomplete="off">
      <p class="sub">${list.length} chương · ${fmtN(storyWords(sid))} chữ</p>
    </div>
    <details class="notes" ${s.notes ? "" : ""}>
      <summary>Ghi chú truyện <span class="sub">nhân vật, bối cảnh, ý tưởng</span></summary>
      <textarea id="notes" rows="6" placeholder="Ví dụ: Lam, 16 tuổi, sống ở làng chài. Truyện diễn ra mùa bão năm 2009…">${esc(s.notes)}</textarea>
    </details>
    <div class="row between"><span class="eyebrow">Các chương</span>
      ${list.length > 1 || view.arrange ? `<button class="linkbtn" id="arrange">${view.arrange ? "Xong" : "Sắp xếp / xoá chương"}</button>` : ""}</div>
    <div class="list">` + (list.length ? list.map((c,i) => view.arrange
      ? `<div class="item static"><span class="num">${i+1}</span>
          <span class="txt"><span class="t">${esc(c.title || "Chương không tên")}</span><span class="m">${fmtN(chWords(c))} chữ</span></span>
          <span class="row tight">
            <button class="iconbtn sm" data-up="${esc(c.id)}" aria-label="Chuyển lên" ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
            <button class="iconbtn sm" data-down="${esc(c.id)}" aria-label="Chuyển xuống" ${i === list.length-1 ? "disabled" : ""}>${ICON.down}</button>
            <button class="iconbtn sm danger" data-delch="${esc(c.id)}" aria-label="Xoá chương">${ICON.trash}</button></span></div>`
      : `<button class="item" data-ch="${esc(c.id)}"><span class="num">${i+1}</span>
          <span class="txt"><span class="t">${esc(c.title || "Chương không tên")}</span>
          <span class="m">${fmtN(chWords(c))} chữ${imageIds(c.body).length ? ` · ${imageIds(c.body).length} ảnh` : ""} · ${ago(c.updatedAt)}</span></span>
          <span class="chev">${ICON.chev}</span></button>`).join("") : `<p class="sub" style="padding:14px 4px">Truyện chưa có chương nào.</p>`) + `</div>`;
  if(delC) html += `<div class="box danger"><p>Xoá “${esc(delC.title || "Chương không tên")}”? Cả chữ và ảnh trong chương sẽ mất, không lấy lại được.</p>
      <div class="row"><button class="ghost danger" id="yesDelCh">Xoá chương</button><button class="ghost" id="noDelCh">Giữ lại</button></div></div>`;
  html += `<div class="row"><button class="primary" id="addCh">${ICON.plus} Thêm chương</button>
      <button class="ghost" id="readBtn2">${ICON.book} Đọc truyện</button></div>
    <div class="stack-8" style="margin-top:10px">
      <span class="eyebrow">Mang truyện đi</span>
      <div class="row">
        <button class="ghost" id="html">Xuất file đọc (.html, có ảnh)</button>
        <button class="ghost" id="txt">Xuất chữ (.txt)</button>
        <button class="ghost danger" id="del">Xoá truyện</button>
      </div>
      <p class="note">File xuất ra là bản thường, không còn mã hoá. Chỉ xuất khi thật cần và xoá file sau khi dùng xong.</p>
    </div>`;
  if(opt.confirmDel){
    html += `<div class="box danger"><p>Xoá truyện “${esc(s.title || "chưa đặt tên")}” cùng ${list.length} chương? Không lấy lại được.</p>
      <div class="row"><button class="ghost danger" id="yesDel">Xoá hẳn</button><button class="ghost" id="noDel">Giữ lại</button></div></div>`;
  }
  html += `</div>`;
  const main = resetMain(), st = opt.keepScroll ? main.scrollTop : 0;
  main.innerHTML = html; main.scrollTop = st;
  $("#back").onclick = renderLibrary;
  $("#lockBtn").onclick = lock;
  $("#readBtn").onclick = $("#readBtn2").onclick = () => renderRead(sid);
  const ti = $("#storyTitle");
  let tT;
  const saveTitle = () => { const v = ti.value.trim(); if(v === s.title) return; s.title = v; s.updatedAt = now(); saveStory(s).catch(() => toast("Chưa lưu được tên truyện.")); };
  ti.oninput = () => { clearTimeout(tT); tT = setTimeout(saveTitle, 600); };
  ti.onblur = () => { clearTimeout(tT); saveTitle(); };
  ti.onkeydown = e => { if(e.key === "Enter") ti.blur(); };
  const notes = $("#notes"); let nT;
  const saveNotes = () => { if(notes.value === s.notes) return; s.notes = notes.value; saveStory(s).catch(() => toast("Chưa lưu được ghi chú.")); };
  notes.oninput = () => { clearTimeout(nT); nT = setTimeout(saveNotes, 700); };
  notes.onblur = () => { clearTimeout(nT); saveNotes(); };
  const leave = () => { saveTitle(); saveNotes(); };
  $$("[data-ch]").forEach(b => b.onclick = () => { leave(); openEditor(b.dataset.ch); });
  if($("#arrange")) $("#arrange").onclick = () => renderStory(sid, {arrange:!view.arrange, keepScroll:true});
  $$("[data-up]").forEach(b => b.onclick = () => moveChapter(sid, b.dataset.up, -1));
  $$("[data-down]").forEach(b => b.onclick = () => moveChapter(sid, b.dataset.down, 1));
  $$("[data-delch]").forEach(b => b.onclick = () => renderStory(sid, {arrange:true, confirmCh:b.dataset.delch, keepScroll:true}));
  if(delC){
    $("#yesDelCh").onclick = async () => {
      try{ await DB.write([{store:"chapters", op:"del", key:delC.id}]); }catch(e){ return toast("Chưa xoá được."); }
      chapters.delete(delC.id); cleanupImages(); toast("Đã xoá chương.");
      renderStory(sid, {arrange:true, keepScroll:true});
    };
    $("#noDelCh").onclick = () => renderStory(sid, {arrange:true, keepScroll:true});
  }
  $("#addCh").onclick = () => { leave(); addChapter(sid); };
  $("#txt").onclick = () => offerFile(fileName(s.title, "txt"), storyText(sid), "text/plain");
  $("#html").onclick = async () => { toast("Đang chuẩn bị file…"); offerFile(fileName(s.title, "html"), await storyHTML(sid), "text/html"); };
  $("#del").onclick = () => renderStory(sid, {confirmDel:true, keepScroll:true});
  if(opt.confirmDel){
    $("#yesDel").onclick = async () => {
      const ops = [{store:"stories", op:"del", key:sid}, ...list.map(c => ({store:"chapters", op:"del", key:c.id}))];
      try{ await DB.write(ops); }catch(e){ return toast("Chưa xoá được. Thử lại sau."); }
      stories.delete(sid); list.forEach(c => chapters.delete(c.id)); cleanupImages();
      toast("Đã xoá truyện."); renderLibrary();
    };
    $("#noDel").onclick = () => renderStory(sid, {keepScroll:true});
  }
  if(opt.focusTitle) ti.focus();
}

async function moveChapter(sid, cid, dir){
  const list = storyChapters(sid), i = list.findIndex(c => c.id === cid), j = i + dir;
  if(i < 0 || j < 0 || j >= list.length) return;
  list.splice(j, 0, list.splice(i, 1)[0]);
  const ops = [];
  for(let k = 0; k < list.length; k++){
    if(list[k].order === k + 1) continue;
    const next = {...list[k], order:k + 1};
    chapters.set(next.id, next);
    ops.push({store:"chapters", op:"put", value: await sealChapter(next)});
  }
  try{ await DB.write(ops); }catch(e){ toast("Chưa lưu được thứ tự."); }
  renderStory(sid, {arrange:true, keepScroll:true});
}

async function addChapter(sid){
  const list = storyChapters(sid), t = now();
  const c = {id:uid(), sid, title:"Chương " + (list.length + 1), body:"<p><br></p>", order: list.reduce((m,x) => Math.max(m, x.order||0), 0) + 1, createdAt:t, updatedAt:t};
  try{ await saveChapter(c); }catch(e){ return toast("Chưa thêm được chương."); }
  chapters.set(c.id, c); touchStory(sid, t);
  openEditor(c.id, true);
}

/* ---------- reading view ---------- */
function renderRead(sid){
  const s = stories.get(sid); if(!s) return renderLibrary();
  view = {name:"read", sid};
  setBar(`<button class="iconbtn" id="back" aria-label="Về truyện">${ICON.back}</button>
    <div class="grow bar-title">${esc(s.title || "Truyện chưa đặt tên")}</div>
    <button class="iconbtn" id="lockBtn" aria-label="Khoá sổ">${ICON.lock}</button>`);
  const list = storyChapters(sid);
  const main = resetMain(); main.classList.add("reading");
  main.innerHTML = `<article class="col read">
    <header class="read-head"><h1>${esc(s.title || "Truyện chưa đặt tên")}</h1><p class="sub">${list.length} chương · ${fmtN(storyWords(sid))} chữ</p></header>
    ${list.map((c,i) => `<section class="read-ch"><h2><span class="num">${i+1}</span> ${esc(c.title || "Chương không tên")}</h2>
      <div class="prose" data-body="${esc(c.id)}"></div>
      <button class="linkbtn" data-edit="${esc(c.id)}">Sửa chương này</button></section>`).join("")}
  </article>`;
  main.style.setProperty("--fs", fontSize + "px");
  list.forEach(c => { const el = main.querySelector(`[data-body="${c.id}"]`); el.innerHTML = cleanHTML(c.body); decorateFigures(el, false); });
  $("#back").onclick = () => renderStory(sid);
  $("#lockBtn").onclick = lock;
  $$("[data-edit]").forEach(b => b.onclick = () => openEditor(b.dataset.edit));
}

function decorateFigures(root, editable){
  root.querySelectorAll("figure.img").forEach(f => decorateFigure(f, editable));
}
function decorateFigure(f, editable){
  {
    const id = f.getAttribute("data-img");
    const fc = f.querySelector("figcaption");
    const img = document.createElement("img"); img.alt = fc && fc.textContent ? fc.textContent : "Ảnh trong truyện"; img.decoding = "async";
    f.insertBefore(img, f.firstChild);
    if(editable){
      f.contentEditable = "false";
      if(fc){ fc.contentEditable = "true"; fc.setAttribute("data-ph", "Thêm chú thích…"); }
    } else if(fc && !fc.textContent.trim()) fc.remove();
    imageURL(id).then(u => { if(u) img.src = u; else f.classList.add("missing"); }).catch(() => f.classList.add("missing"));
  }
}

/* ---------- exports ---------- */
function storyText(sid){
  const s = stories.get(sid);
  const parts = [(s?.title || "Truyện chưa đặt tên").toUpperCase(), ""];
  storyChapters(sid).forEach(c => parts.push(c.title || "Chương không tên", "", plainText(c.body), "", ""));
  return parts.join("\n").trim() + "\n";
}
async function storyHTML(sid){
  const s = stories.get(sid), list = storyChapters(sid);
  const d = document.createElement("div");
  for(const c of list){
    const sec = document.createElement("section");
    const h = document.createElement("h2"); h.textContent = c.title || "Chương không tên"; sec.appendChild(h);
    const body = document.createElement("div"); body.innerHTML = cleanHTML(c.body);
    for(const f of Array.from(body.querySelectorAll("figure"))){
      const src = await imageDataURL(f.getAttribute("data-img")).catch(() => null);
      const fc = f.querySelector("figcaption");
      if(!src){ f.remove(); continue; }
      const img = document.createElement("img"); img.src = src; img.alt = fc ? fc.textContent : "";
      f.insertBefore(img, f.firstChild); f.removeAttribute("data-img");
      if(fc && !fc.textContent.trim()) fc.remove();
    }
    while(body.firstChild) sec.appendChild(body.firstChild);
    d.appendChild(sec);
  }
  const title = esc(s?.title || "Truyện chưa đặt tên");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{max-width:38em;margin:0 auto;padding:32px 20px 80px;font:19px/1.75 ui-serif,"New York",Georgia,serif;color:#1A2133;background:#fff}
h1{font-size:1.8em;line-height:1.2;margin:0 0 1.2em}h2{font-size:1.25em;margin:2.4em 0 1em;font-style:italic}h3{font-size:1.1em;margin:1.4em 0 .6em}
p{margin:0 0 .9em}blockquote{margin:0 0 .9em;padding-left:14px;border-left:3px solid #ccd;font-style:italic;color:#555}
hr{border:0;text-align:center;margin:1.6em 0}hr::after{content:"⁂";color:#889}
figure{margin:1.4em auto;text-align:center}figure img{max-width:100%;border-radius:6px}figure[data-size="s"]{max-width:40%}figure[data-size="m"]{max-width:70%}
figcaption{font-size:.8em;color:#667;font-style:italic;margin-top:6px}section{page-break-before:always}</style></head>
<body><h1>${title}</h1>${d.innerHTML}</body></html>`;
}
const fileName = (title, ext) => ((title || "truyen").replace(/[\\/:*?"<>|]+/g, " ").trim() || "truyen") + "." + ext;
let externalUntil = 0;   // share sheet or file picker is open on top of the app
async function offerFile(name, text, mime){
  externalUntil = now() + 120000;
  const file = new File([text], name, {type:mime});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return true; }
  }catch(e){ if(e && e.name === "AbortError") return false; }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/* ---------- editor ---------- */
let ed = null;          // {id, dirty, t}
let savedRange = null;  // last caret position inside the editor
const bodyEl = () => $("#body");

function openEditor(cid, focusTitle){
  const c = chapters.get(cid); if(!c) return;
  const s = stories.get(c.sid);
  view = {name:"editor", sid:c.sid, cid};
  ed = {id:cid, dirty:false, t:null};
  savedRange = null;
  setBar(`<button class="iconbtn" id="back" aria-label="Về danh sách chương">${ICON.back}</button>
    <div class="grow"></div><span class="status" id="status" data-s="saved"><span class="dot"></span><span id="statusTxt">Đã lưu</span><span id="wc"></span></span>`);
  const main = resetMain(); main.classList.add("editing");
  main.innerHTML = `<div class="editor">
    <div class="ed-scroll" id="edScroll"><div class="ed-inner">
      <div class="ed-story">${esc(s?.title || "Truyện chưa đặt tên")}</div>
      <input id="chTitle" class="ch-title" placeholder="Tên chương" maxlength="200" autocomplete="off">
      <div id="body" class="prose" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Nội dung chương" spellcheck="false" autocapitalize="sentences"></div>
    </div></div>
    <div class="tb" id="tb" role="toolbar" aria-label="Định dạng">
      <button data-cmd="undo" aria-label="Hoàn tác">${ICON.undo}</button>
      <button data-cmd="redo" aria-label="Làm lại">${ICON.redo}</button>
      <span class="sep"></span>
      <button data-cmd="image" class="accent" aria-label="Chèn ảnh">${ICON.image}</button>
      <button data-cmd="bold" aria-label="In đậm"><b>B</b></button>
      <button data-cmd="italic" aria-label="In nghiêng"><i>I</i></button>
      <button data-cmd="underline" aria-label="Gạch chân"><u>U</u></button>
      <button data-cmd="h3" aria-label="Tiêu đề nhỏ"><span class="glyph">H</span></button>
      <button data-cmd="center" aria-label="Canh giữa">${ICON.center}</button>
      <button data-cmd="quote" aria-label="Trích dẫn hoặc thư"><span class="glyph">❝</span></button>
      <button data-cmd="hr" aria-label="Ngắt cảnh"><span class="glyph">⁂</span></button>
      <span class="sep"></span>
      <button data-cmd="smaller" aria-label="Chữ nhỏ hơn"><span class="glyph sm">A−</span></button>
      <button data-cmd="bigger" aria-label="Chữ lớn hơn"><span class="glyph">A+</span></button>
    </div>
    <input id="imgIn" type="file" accept="image/*" multiple hidden>
  </div>`;
  main.style.setProperty("--fs", fontSize + "px");
  const body = bodyEl(), title = $("#chTitle");
  title.value = c.title || "";
  body.innerHTML = cleanHTML(c.body) || "<p><br></p>";
  decorateFigures(body, true);
  try{ document.execCommand("defaultParagraphSeparator", false, "p"); }catch(e){}
  updateEmpty(); updateWC();

  body.addEventListener("input", () => { ensureBlocks(); markDirty(); });
  title.addEventListener("input", markDirty);
  title.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); placeCaret(body.firstElementChild, true); } });
  body.addEventListener("blur", () => flush());
  title.addEventListener("blur", () => flush());
  body.addEventListener("paste", onPaste);
  body.addEventListener("click", onBodyClick);
  body.addEventListener("keydown", e => {
    if(e.target.tagName === "FIGCAPTION" && e.key === "Enter"){ e.preventDefault(); const f = e.target.closest("figure"); let n = f.nextElementSibling; if(!n || n.tagName === "FIGURE" || n.tagName === "HR"){ n = document.createElement("p"); n.innerHTML = "<br>"; f.after(n); } placeCaret(n, false); }
  });
  const tb = $("#tb");
  tb.addEventListener("mousedown", e => { if(e.target.closest("button")) e.preventDefault(); });
  tb.addEventListener("click", e => { const b = e.target.closest("button[data-cmd]"); if(b) runCmd(b.dataset.cmd); });
  $("#imgIn").addEventListener("change", e => { const files = Array.from(e.target.files || []); e.target.value = ""; externalUntil = 0; if(files.length) insertImages(files); });
  $("#back").onclick = async () => { await flush(); ed = null; cleanupImages(); renderStory(c.sid, {keepScroll:false}); };

  if(focusTitle){ title.focus(); title.select(); }
  else { const last = body.lastElementChild; if(last && last.tagName !== "FIGURE") placeCaret(last, false); const sc = $("#edScroll"); sc.scrollTop = sc.scrollHeight; }
}

document.addEventListener("selectionchange", () => {
  const body = bodyEl(); if(!body) return;
  const sel = getSelection();
  if(sel.rangeCount && body.contains(sel.anchorNode)){ savedRange = sel.getRangeAt(0).cloneRange(); updateToolbarState(); }
});

function placeCaret(el, atStart){
  if(!el) return;
  const body = bodyEl(); body.focus({preventScroll:true});
  const r = document.createRange();
  r.selectNodeContents(el); r.collapse(!!atStart);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  savedRange = r.cloneRange();
  try{ el.scrollIntoView({block:"nearest"}); }catch(e){}
}
function restoreSel(){
  const body = bodyEl(); if(!body) return false;
  if(document.activeElement !== body && !body.contains(document.activeElement)) body.focus({preventScroll:true});
  if(savedRange && body.contains(savedRange.startContainer)){
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(savedRange);
    return true;
  }
  return false;
}
function currentBlock(){
  const body = bodyEl(); if(!body || !savedRange) return null;
  let n = savedRange.startContainer;
  while(n && n.parentNode !== body) n = n.parentNode;
  return n && n.parentNode === body ? n : null;
}
function ensureBlocks(){
  const body = bodyEl();
  // wrap stray text typed straight into the editor
  Array.from(body.childNodes).forEach(n => {
    if(n.nodeType === 3 && n.nodeValue.trim()){ const p = document.createElement("p"); n.before(p); p.appendChild(n); placeCaret(p, false); }
    else if(n.nodeType === 1 && n.tagName === "DIV" && !n.classList.contains("figbar")){ const p = document.createElement("p"); p.innerHTML = n.innerHTML; n.replaceWith(p); }
  });
  if(!body.firstChild){ body.innerHTML = "<p><br></p>"; placeCaret(body.firstChild, true); }
}
function updateEmpty(){
  const body = bodyEl(); if(!body) return;
  body.classList.toggle("isEmpty", !body.textContent.trim() && !body.querySelector("figure,hr") && body.children.length <= 1);
}
function updateWC(){
  const el = $("#wc"), body = bodyEl(); if(!el || !body) return;
  el.textContent = " · " + fmtN(countWords(plainText(body.innerHTML, false))) + " chữ";
}
function markDirty(){
  if(!ed) return;
  ed.dirty = true; setStatus("saving", "Đang gõ…"); updateEmpty();
  clearTimeout(ed.t); ed.t = setTimeout(flush, 800);
}
function setFont(d){ fontSize = Math.max(14, Math.min(28, fontSize + d)); $("#main").style.setProperty("--fs", fontSize + "px"); ls.set("sotruyen.fs", fontSize); }
function setStatus(s, txt){ const el = $("#status"); if(!el) return; el.dataset.s = s; $("#statusTxt").textContent = txt; }

function toggleBlock(tag){
  const b = currentBlock();
  const isIt = b && b.nodeType === 1 && b.tagName === tag.toUpperCase();
  document.execCommand("formatBlock", false, isIt ? "<p>" : `<${tag}>`);
}
function runCmd(cmd){
  if(cmd === "smaller") return setFont(-1);
  if(cmd === "bigger") return setFont(1);
  if(cmd === "image"){ restoreSel(); externalUntil = now() + 120000; $("#imgIn").click(); return; }
  restoreSel();
  try{
    if(cmd === "undo" || cmd === "redo") document.execCommand(cmd);
    else if(cmd === "bold" || cmd === "italic" || cmd === "underline") document.execCommand(cmd);
    else if(cmd === "h3") toggleBlock("h3");
    else if(cmd === "quote") toggleBlock("blockquote");
    else if(cmd === "center"){
      const b = currentBlock();
      document.execCommand(b && b.nodeType === 1 && b.style.textAlign === "center" ? "justifyLeft" : "justifyCenter");
    }
    else if(cmd === "hr") insertBlock(document.createElement("hr"));
  }catch(e){}
  ensureBlocks(); markDirty(); updateWC(); updateToolbarState();
}
function updateToolbarState(){
  const tb = $("#tb"); if(!tb) return;
  const b = currentBlock(), tag = b && b.nodeType === 1 ? b.tagName : "";
  const st = n => { try{ return document.queryCommandState(n); }catch(e){ return false; } };
  const set = (c, on) => { const el = tb.querySelector(`[data-cmd="${c}"]`); if(el) el.classList.toggle("on", !!on); };
  set("bold", st("bold")); set("italic", st("italic")); set("underline", st("underline"));
  set("h3", tag === "H3"); set("quote", tag === "BLOCKQUOTE"); set("center", b && b.nodeType === 1 && b.style && b.style.textAlign === "center");
}

// Put a block (image or scene break) at the caret, splitting the paragraph there if needed.
function insertBlock(node){
  const body = bodyEl();
  let block = currentBlock();
  if(block && block.nodeType === 3){ const p = document.createElement("p"); block.before(p); p.appendChild(block); block = p; }
  let after = null;
  if(!block){ body.appendChild(node); }
  else if(block.tagName === "FIGURE" || block.tagName === "HR"){ block.after(node); }
  else if(!block.textContent.trim() && !block.querySelector("img")){ block.before(node); after = block; }
  else {
    const r = document.createRange();
    r.setStart(savedRange.startContainer, savedRange.startOffset);
    r.setEnd(block, block.childNodes.length);
    const tail = r.extractContents();
    const rest = document.createElement(block.tagName === "H3" ? "p" : block.tagName.toLowerCase());
    if(block.style.textAlign) rest.style.textAlign = block.style.textAlign;
    rest.appendChild(tail);
    trimEdge(rest, true); trimEdge(block, false);
    if(!block.textContent.trim() && !block.querySelector("br")) block.innerHTML = "<br>";
    block.after(node);
    if(rest.textContent.trim()){ node.after(rest); after = rest; }
  }
  if(!after){
    after = node.nextElementSibling;
    if(!after || after.tagName === "FIGURE" || after.tagName === "HR"){ after = document.createElement("p"); after.innerHTML = "<br>"; node.after(after); }
  }
  placeCaret(after, true);
  return node;
}

// drop the space left at the cut when a sentence is split around an image
function trimEdge(el, start){
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = []; while(w.nextNode()) nodes.push(w.currentNode);
  const n = start ? nodes[0] : nodes[nodes.length - 1];
  if(n) n.nodeValue = start ? n.nodeValue.replace(/^\s+/, "") : n.nodeValue.replace(/\s+$/, "");
}
function onPaste(e){
  if(e.target.closest && e.target.closest("figcaption")){
    e.preventDefault();
    const t = (e.clipboardData.getData("text/plain") || "").replace(/\s+/g, " ");
    document.execCommand("insertText", false, t); markDirty(); return;
  }
  e.preventDefault();
  const html = e.clipboardData.getData("text/html"), text = e.clipboardData.getData("text/plain");
  if(html && /data-img=|<(strong|b|em|i|u|h[1-6]|blockquote)\b/i.test(html)){
    const tmp = document.createElement("div"); tmp.innerHTML = cleanHTML(html);
    document.execCommand("insertHTML", false, tmp.innerHTML);
    decorateNew();
  } else if(text){
    const parts = text.replace(/\r/g, "").split(/\n+/);
    parts.forEach((line, i) => { if(i) document.execCommand("insertParagraph"); if(line) document.execCommand("insertText", false, line); });
    ensureBlocks();
  }
  markDirty(); updateWC();
}
function decorateNew(){
  bodyEl().querySelectorAll("figure.img").forEach(f => { if(!f.querySelector("img")) decorateFigure(f, true); });
}

/* image tools: tap an image to resize, move or remove it */
function onBodyClick(e){
  const bar = e.target.closest(".figbar");
  if(bar){
    const btn = e.target.closest("button"); if(!btn) return;
    e.preventDefault();
    const f = bar.closest("figure"), act = btn.dataset.act;
    if(act === "s" || act === "m" || act === "l"){ f.setAttribute("data-size", act); selectFigure(f); }
    else if(act === "up"){ const p = f.previousElementSibling; if(p){ p.before(f); f.scrollIntoView({block:"nearest"}); } selectFigure(f); }
    else if(act === "down"){ const n = f.nextElementSibling; if(n){ n.after(f); f.scrollIntoView({block:"nearest"}); } selectFigure(f); }
    else if(act === "del"){ const n = f.nextElementSibling || f.previousElementSibling; f.remove(); ensureBlocks(); if(n) placeCaret(n, true); }
    markDirty(); updateWC();
    return;
  }
  const f = e.target.closest("figure");
  if(f && !e.target.closest("figcaption")) selectFigure(f);
  else selectFigure(null);
}
function selectFigure(f){
  const body = bodyEl();
  body.querySelectorAll("figure.sel").forEach(x => { x.classList.remove("sel"); x.querySelector(".figbar")?.remove(); });
  if(!f) return;
  f.classList.add("sel");
  const size = f.getAttribute("data-size") || "l";
  const bar = document.createElement("div");
  bar.className = "figbar"; bar.contentEditable = "false";
  bar.innerHTML = `<button data-act="s" class="${size === "s" ? "on" : ""}">Nhỏ</button><button data-act="m" class="${size === "m" ? "on" : ""}">Vừa</button><button data-act="l" class="${size === "l" ? "on" : ""}">To</button>
    <button data-act="up" aria-label="Đưa ảnh lên trên">${ICON.up}</button><button data-act="down" aria-label="Đưa ảnh xuống dưới">${ICON.down}</button>
    <button data-act="del" class="danger" aria-label="Xoá ảnh">${ICON.trash}</button>`;
  f.appendChild(bar);
}

async function prepareImage(file){
  const MAX = 1600;
  let src = null, w = 0, h = 0;
  try{ if(window.createImageBitmap){ src = await createImageBitmap(file); w = src.width; h = src.height; } }catch(e){ src = null; }
  if(!src){
    try{ const u = URL.createObjectURL(file); const im = new Image(); im.src = u; await im.decode(); src = im; w = im.naturalWidth; h = im.naturalHeight; setTimeout(() => URL.revokeObjectURL(u), 1000); }catch(e){ src = null; }
  }
  // GIFs keep their animation; anything we cannot redraw is kept as is
  if(!src || !w || file.type === "image/gif"){
    if(file.type && !/^image\//.test(file.type)) throw new Error("not-image");
    return {bytes: new Uint8Array(await file.arrayBuffer()), type: file.type || "image/jpeg"};
  }
  // Redraw every photo: shrinks it and strips hidden data such as the GPS location.
  const sc = Math.min(1, MAX / Math.max(w, h)), cw = Math.round(w * sc), ch = Math.round(h * sc);
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d");
  const png = file.type === "image/png";
  if(!png){ ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); }
  ctx.drawImage(src, 0, 0, cw, ch);
  const blob = await new Promise(r => cv.toBlob(r, png ? "image/png" : "image/jpeg", 0.86));
  if(!blob) throw new Error("encode");
  return {bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type};
}
async function insertImages(files){
  if(!ed) return;
  const c = chapters.get(ed.id);
  setStatus("saving", "Đang thêm ảnh…");
  for(const file of files){
    try{
      const {bytes, type} = await prepareImage(file);
      const id = uid();
      await DB.write([{store:"images", op:"put", value:{id, sid:c.sid, cid:c.id, type, enc: await sealBytes(bytes), createdAt:now()}}]);
      imgURL.set(id, URL.createObjectURL(new Blob([bytes], {type})));
      const f = document.createElement("figure");
      f.className = "img"; f.setAttribute("data-img", id); f.setAttribute("data-size", "l");
      f.appendChild(document.createElement("figcaption"));
      decorateFigure(f, true);
      insertBlock(f);
    }catch(e){ toast(e && e.message === "not-image" ? "File này không phải ảnh." : "Chưa thêm được ảnh. Bộ nhớ máy có thể đã đầy."); }
  }
  markDirty(); updateWC();
  await flush();
}

async function flush(){
  if(!ed || !ed.dirty || !KEY) return;
  const e = ed; clearTimeout(e.t);
  const c = chapters.get(e.id), body = bodyEl(), title = $("#chTitle");
  if(!c || !body) return;
  const t = now();
  const next = {...c, title:title.value.trim(), body:cleanHTML(body.innerHTML) || "<p><br></p>", updatedAt:t};
  e.dirty = false;
  setStatus("saving", "Đang lưu…");
  try{
    await saveChapter(next);
    chapters.set(c.id, next); touchStory(c.sid, t);
    if(ed === e && !e.dirty){ setStatus("saved", "Đã lưu"); updateWC(); }
  }catch(err){
    e.dirty = true;
    setStatus("error", "Chưa lưu được, bộ nhớ máy có thể đã đầy");
    if(ed === e){ clearTimeout(e.t); e.t = setTimeout(flush, 5000); }
  }
}

/* ---------- settings: backup, restore, change password ---------- */
function renderSettings(){
  view = {name:"settings"};
  setBar(`<button class="iconbtn" id="back" aria-label="Về tủ truyện">${ICON.back}</button><div class="grow"></div>
    <button class="iconbtn" id="lockBtn" aria-label="Khoá sổ">${ICON.lock}</button>`);
  const lastBackup = ls.get("sotruyen.lastBackup", 0);
  resetMain().innerHTML = `<div class="col">
    <h1>Cài đặt & sao lưu</h1>
    <section class="box">
      <h2>Sao lưu</h2>
      <p class="sub">Tạo một file chứa toàn bộ truyện và ảnh, <strong>vẫn được mã hoá</strong> bằng mật khẩu hiện tại. Lưu file vào Tệp, iCloud hoặc ổ cứng riêng. Không ai đọc được file nếu không có mật khẩu.</p>
      <p class="sub">${lastBackup ? "Lần gần nhất: " + ago(lastBackup) : "Chưa sao lưu lần nào."}</p>
      <div class="row"><button class="primary" id="bk">Tạo file sao lưu</button></div>
    </section>
    <section class="box">
      <h2>Khôi phục</h2>
      <p class="sub">Chọn file sao lưu (.json). Truyện trong file được gộp vào sổ. Bản nào sửa sau sẽ được giữ.</p>
      <div class="row"><button class="ghost" id="rfBtn" type="button">Chọn file sao lưu</button><input id="rf" type="file" accept=".json,application/json" hidden></div>
      <div id="restoreBox"></div>
    </section>
    <section class="box">
      <h2>Đổi mật khẩu</h2>
      <form id="cp" class="form" novalidate>
        <div class="field"><label for="op">Mật khẩu hiện tại</label><input id="op" type="password" autocomplete="current-password" autocapitalize="off"></div>
        <div class="field"><label for="np">Mật khẩu mới</label><input id="np" type="password" autocomplete="new-password" autocapitalize="off"></div>
        <div class="field"><label for="np2">Nhập lại mật khẩu mới</label><input id="np2" type="password" autocomplete="new-password" autocapitalize="off"></div>
        <p class="err" id="cpErr" hidden></p>
        <div class="row"><button class="ghost" id="cpGo" type="submit">Đổi mật khẩu</button></div>
        <p class="note">Sau khi đổi, các file sao lưu cũ vẫn mở bằng mật khẩu cũ. Hãy tạo bản sao lưu mới.</p>
      </form>
    </section>
    <section class="box">
      <h2>Bộ nhớ và chạy không cần mạng</h2>
      <p class="sub" id="storage">Đang kiểm tra…</p>
      <p class="sub" id="offline">Đang kiểm tra…</p>
    </section>
    <section class="box">
      <h2>Về sự riêng tư</h2>
      <p class="sub">Chữ và ảnh được mã hoá AES-256 bằng khoá sinh từ mật khẩu của bạn, chỉ lưu trên máy này. Ảnh được vẽ lại khi chèn nên thông tin ẩn như vị trí chụp bị xoá. Ứng dụng không có máy chủ, không gửi dữ liệu đi đâu và chạy được khi không có mạng. Sổ tự khoá khi bạn rời ứng dụng quá 10 phút, và nội dung luôn được che khi bạn xem màn hình đa nhiệm. Mã ứng dụng được giữ cố định trên máy sau khi cài, không tự cập nhật từ mạng.</p>
    </section>
  </div>`;
  $("#back").onclick = renderLibrary;
  $("#lockBtn").onclick = lock;
  $("#bk").onclick = backup;
  $("#rfBtn").onclick = () => { externalUntil = now() + 120000; $("#rf").click(); };
  $("#rf").onchange = e => { const f = e.target.files[0]; e.target.value = ""; externalUntil = 0; if(f) startRestore(f); };
  $("#cp").addEventListener("submit", changePassword);
  checkOffline();
}

async function checkOffline(){
  const st = $("#storage"), el = $("#offline");
  try{
    const n = (await DB.keys("images")).length;
    let used = "";
    if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); used = ` Đang dùng khoảng ${(e.usage/1048576).toFixed(1)} MB bộ nhớ máy.`; }
    if(st) st.textContent = `${stories.size} truyện, ${chapters.size} chương, ${n} ảnh.${used}`;
  }catch(e){ if(st) st.textContent = ""; }
  if(!el) return;
  let ready = false;
  try{ ready = !!(navigator.serviceWorker && navigator.serviceWorker.controller) && (await (await caches.open("sotruyen-v4")).keys()).length >= 7; }catch(e){}
  el.innerHTML = ready
    ? "<strong>Đã sẵn sàng chạy không cần mạng.</strong> Ứng dụng đã được lưu đầy đủ trên máy, mở được kể cả khi trang web bị gỡ xuống."
    : "Chưa sẵn sàng chạy không cần mạng. Hãy mở ứng dụng từ màn hình chính khi có mạng, đóng hẳn rồi mở lại một lần.";
}

async function backup(){
  try{
    toast("Đang tạo file sao lưu…");
    const [rs, rc, ri] = await Promise.all([DB.all("stories"), DB.all("chapters"), DB.all("images")]);
    const images = ri.map(r => ({id:r.id, sid:r.sid, cid:r.cid, type:r.type, createdAt:r.createdAt, data:b64(r.enc)}));
    const data = {app:"so-truyen", v:2, exportedAt:now(), vault:{salt:vault.salt, iter:vault.iter, check:vault.check}, stories:rs, chapters:rc, images};
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    const name = `so-truyen-saoluu-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
    const ok = await offerFile(name, JSON.stringify(data), "application/json");
    if(ok){ ls.set("sotruyen.lastBackup", now()); toast("Đã tạo file sao lưu."); if(view.name === "library") renderLibrary(); }
  }catch(e){ toast("Chưa tạo được file sao lưu."); }
}

async function startRestore(file){
  let data;
  try{ data = JSON.parse(await file.text()); }catch(e){ return toast("File này không đọc được."); }
  if(!data || data.app !== "so-truyen" || !data.vault || !Array.isArray(data.stories)) return toast("Đây không phải file sao lưu của Sổ Truyện.");
  let same = false;
  try{ same = data.vault.salt === vault.salt && (await unseal(data.vault.check, KEY)) === CHECK; }catch(e){}
  if(same) return restoreWith(data, KEY);
  const box = $("#restoreBox");
  box.innerHTML = `<form id="rp" class="form" novalidate>
    <p class="sub">File này được tạo với mật khẩu khác. Nhập mật khẩu lúc tạo file đó.</p>
    <div class="field"><label for="rpw">Mật khẩu của file sao lưu</label><input id="rpw" type="password" autocomplete="off" autocapitalize="off"></div>
    <p class="err" id="rpErr" hidden></p>
    <div class="row"><button class="ghost" type="submit" id="rpGo">Khôi phục</button></div></form>`;
  $("#rp").addEventListener("submit", async e => {
    e.preventDefault();
    const go = $("#rpGo"); go.disabled = true; go.textContent = "Đang kiểm tra…";
    let k = null; try{ k = await openVault($("#rpw").value, data.vault); }catch(ex){}
    if(!k){ $("#rpErr").textContent = "Sai mật khẩu của file sao lưu."; $("#rpErr").hidden = false; go.disabled = false; go.textContent = "Khôi phục"; return; }
    box.innerHTML = "";
    restoreWith(data, k);
  });
  setTimeout(() => $("#rpw").focus(), 50);
}

async function restoreWith(data, key){
  toast("Đang khôi phục…");
  try{
    const ops = [];
    for(const r of data.stories){
      const cur = stories.get(r.id);
      if(cur && (cur.updatedAt||0) >= (r.updatedAt||0)) continue;
      const m = await unseal(r.enc, key);
      const s = {id:r.id, title:m.title, notes:m.notes || "", createdAt:r.createdAt, updatedAt:r.updatedAt};
      ops.push({store:"stories", op:"put", value: await sealStory(s)}); stories.set(s.id, s);
    }
    for(const r of (data.chapters || [])){
      const cur = chapters.get(r.id);
      if(cur && (cur.updatedAt||0) >= (r.updatedAt||0)) continue;
      const m = await unseal(r.enc, key);
      const c = {id:r.id, sid:r.sid, title:m.title, body: m.fmt === "html" ? m.body : textToHTML(m.body), order:r.order, createdAt:r.createdAt, updatedAt:r.updatedAt};
      ops.push({store:"chapters", op:"put", value: await sealChapter(c)}); chapters.set(c.id, c);
      if(!stories.has(c.sid)){ const s = {id:c.sid, title:"", notes:"", createdAt:c.createdAt, updatedAt:c.updatedAt}; stories.set(s.id, s); ops.push({store:"stories", op:"put", value: await sealStory(s)}); }
    }
    const have = new Set(await DB.keys("images"));
    for(const im of (data.images || [])){
      if(have.has(im.id)) continue;
      const enc = key === KEY ? unb64(im.data) : await sealBytes(await unsealBytes(unb64(im.data), key));
      ops.push({store:"images", op:"put", value:{id:im.id, sid:im.sid, cid:im.cid, type:im.type, createdAt:im.createdAt, enc}});
    }
    await DB.write(ops);
    toast(ops.length ? "Đã khôi phục từ file sao lưu." : "Sổ đã có đủ nội dung trong file này.");
    checkOffline();
  }catch(e){ toast("File sao lưu bị hỏng, chưa khôi phục được."); }
}

async function changePassword(e){
  e.preventDefault();
  const err = $("#cpErr"), go = $("#cpGo");
  const fail = m => { err.textContent = m; err.hidden = false; go.disabled = false; go.textContent = "Đổi mật khẩu"; };
  err.hidden = true;
  const op = $("#op").value, np = $("#np").value, np2 = $("#np2").value;
  const weak = pwProblem(np); if(weak) return fail(weak);
  if(np !== np2) return fail("Hai lần nhập mật khẩu mới chưa khớp.");
  go.disabled = true; go.textContent = "Đang kiểm tra…";
  let ok = null; try{ ok = await openVault(op, vault); }catch(ex){}
  if(!ok) return fail("Mật khẩu hiện tại chưa đúng.");
  go.textContent = "Đang mã hoá lại…";
  try{
    const {key, vault:v} = await makeVault(np);
    const ops = [{store:"meta", op:"put", value:v, key:"vault"}];
    for(const s of stories.values()) ops.push({store:"stories", op:"put", value: await sealStory(s, key)});
    for(const c of chapters.values()) ops.push({store:"chapters", op:"put", value: await sealChapter(c, key)});
    for(const im of await DB.all("images")) ops.push({store:"images", op:"put", value:{...im, enc: await sealBytes(await unsealBytes(im.enc), key)}});
    await DB.write(ops);   // all-or-nothing
    vault = v; KEY = key;
    $("#op").value = $("#np").value = $("#np2").value = "";
    go.disabled = false; go.textContent = "Đổi mật khẩu";
    toast("Đã đổi mật khẩu. Hãy tạo bản sao lưu mới.");
  }catch(ex){ fail("Chưa đổi được mật khẩu. Mật khẩu cũ vẫn dùng được."); }
}

/* ---------- privacy: hide content in app switcher, lock after 10 minutes away ---------- */
const AWAY_LOCK_MS = 10 * 60 * 1000;
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden"){
    if(KEY && now() < externalUntil) return;
    hiddenAt = now();
    if(KEY){ $("#shield").hidden = false; flush(); }
  } else {
    if(KEY && now() < externalUntil){ externalUntil = 0; }
    else if(KEY && hiddenAt && now() - hiddenAt >= AWAY_LOCK_MS) lock();
    hiddenAt = 0;
    $("#shield").hidden = true;
  }
});
window.addEventListener("pagehide", () => { flush(); });

/* keep the toolbar right above the iPhone keyboard */
if(window.visualViewport){
  const fit = () => {
    const vv = window.visualViewport;
    document.body.style.height = vv.height + "px";
    document.body.classList.toggle("kb", window.innerHeight - vv.height > 120);
    if(vv.offsetTop) window.scrollTo(0, 0);
  };
  visualViewport.addEventListener("resize", fit);
  visualViewport.addEventListener("scroll", fit);
}

/* offline support */
if("serviceWorker" in navigator && location.protocol === "https:"){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
})();
