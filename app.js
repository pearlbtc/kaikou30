/* 开口30天 — 主应用 */
'use strict';

/* ============ 工具 ============ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pad = n => String(n).padStart(2, '0');
const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtHM = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* ---- 微信环境检测（微信内置浏览器禁录音/部分禁播放） ---- */
const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
const canMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/* ============ 存储层（localStorage + IndexedDB） ============ */
const Store = {
  get(key, def) { try { const v = localStorage.getItem('kk30_' + key); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(key, val) { try { localStorage.setItem('kk30_' + key, JSON.stringify(val)); } catch (e) {} },
  del(key) { localStorage.removeItem('kk30_' + key); },
};

/* 录音 blob → IndexedDB */
const Idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('kk30-db', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' }); };
      req.onsuccess = () => { this._db = req.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },
  async put(rec) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('recordings', 'readwrite'); t.objectStore('recordings').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(id) { const db = await this.open(); return new Promise((res, rej) => { const rq = db.transaction('recordings').objectStore('recordings').get(id); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('recordings', 'readwrite'); t.objectStore('recordings').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async all() { const db = await this.open(); return new Promise((res, rej) => { const rq = db.transaction('recordings').objectStore('recordings').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); },
};

/* ============ 全局状态 ============ */
const App = {
  nick: Store.get('nick', ''),
  state: Store.get('state', null),       // { start, streak, best, lastDone }
  daily: Store.get('daily', {}),         // { 'YYYY-MM-DD': {tasks:{}, ratings:{} } }
  recs: Store.get('recs', []),           // meta 列表 [{id,type,date,ts,dur,rating?}]
  page: 'today',
};

/* ------------- 日期相关 ------------- */
function dayIndexOf() {
  if (!App.state || !App.state.start) return 0;
  const s = new Date(App.state.start); s.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.min(29, Math.round((t - s) / 86400000)));
}
function ensureState() {
  if (!App.state) {
    App.state = { start: todayStr(), streak: 0, best: 0, lastDone: null };
    Store.set('state', App.state);
  }
}
function getToday() {
  const t = todayStr();
  if (!App.daily[t]) App.daily[t] = { tasks: {}, ratings: {} };
  return { date: t, d: App.daily[t] };
}
function markTask(key) {
  const t = getToday(); t.d.tasks[key] = { done: true, ts: Date.now() };
  Store.set('daily', App.daily);
  if (!App.state || App.state.lastDone !== t.date) {
    App.state.lastDone = t.date; App.state.streak += 1; App.state.best = Math.max(App.state.best, App.state.streak);
    Store.set('state', App.state);
  }
  renderToday(); greet();
}

/* ============ 每日素材轮换 ============ */
const DAY = dayIndexOf();  // 0-29

function todayBlessText() {
  // 背诵素材：1-10 古文；11-30 八字短句
  if (DAY < 10 && GUWEN_DATA[DAY]) {
    const g = GUWEN_DATA[DAY];
    return { kind: 'guwen', title: g.title, author: g.author || '', text: g.text, trans: g.trans || '', idx: DAY };
  }
  const q = QUOTES_DATA[DAY % QUOTES_DATA.length];
  return { kind: 'quote', title: `${DAY <= 10 ? '人民日报八字短句' : '人民日报八字短句'}`, author: '', text: q.text + '。', trans: q.explain || '', idx: DAY % QUOTES_DATA.length };
}
function todayPhase() {
  const t = todayBlessText();
  return { read: t, quote: HAOCI_DATA[DAY % HAOCI_DATA.length] || HAOCI_DATA[0], manfu: MANFU_DATA[DAY % MANFU_DATA.length], words: pickWords(DAY), extra: [] };
}
function pickWords(day) {
  // 79 分类顺序轮换：每天取 1 分类的头 3 组
  const cat = WORDS_DATA.filter(c => c.rows.length >= 3)[day % WORDS_DATA.filter(c => c.rows.length >= 3).length];
  const rows = cat.rows.slice(0, 3);
  return rows.length ? { cat: cat.cat, rows } : { cat: '情绪情感（一）', rows: WORDS_DATA[0].rows.slice(0, 3) };
}

/* ============ 录音器 ============ */
const Recorder = {
  media: null, stream: null, chunks: [], timer: null, elapsed: 0, onTick: null,
  mime() {
    const c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  },
  async start() {
    if (!canMedia) throw new Error('当前环境不支持录音（微信/浏览器设置）；可改用文字模式');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Cls = window.MediaRecorder; if (!Cls) throw new Error('浏览器不支持录音');
    this.media = new Cls(this.stream, this.mime() ? { mimeType: this.mime() } : undefined);
    this.chunks = [];
    this.media.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.media.start(250);
    this.elapsed = 0;
    this.timer = setInterval(() => { this.elapsed += 1; if (this.onTick) this.onTick(this.elapsed); }, 1000);
  },
  stop() {
    return new Promise(res => {
      clearInterval(this.timer);
      this.media.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        res(new Blob(this.chunks, { type: this.mime() || 'audio/webm' }));
      };
      this.media.stop();
    });
  },
};

/* ============ 弹层 ============ */
function openSheet(title, bodyHTML, opts) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-sheet">
    <div class="ms-head"><div class="ms-title">${esc(title)}</div><button class="ms-close" onclick="closeSheet()">✕</button></div>
    <div class="ms-body">${bodyHTML}</div></div>`;
  m.classList.remove('hidden');
  if (opts && opts.onMount) opts.onMount(m);
}
function closeSheet() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ============ 头像 & 问候 ============ */
function avatarOf(nick) { return nick ? nick.trim().slice(0, 1) : '😶'; }

function greet() {
  const el = $('#greetName');
  if (App.nick) { el.textContent = `${App.nick}，今天也开口！`; $('#tbStreak').textContent = `🔥 ${App.state ? App.state.streak : 0}天`; }
  else { el.textContent = '今天，也开口！'; $('#tbStreak').textContent = '🔥 第1天'; }
  const h = new Date().getHours();
  const phase = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  $('#greetDay').textContent = `${phase} · 今天练 ${getTodayTasks().length} 件事，约 25 分钟`;
}

/* ============ 今日任务 ============ */
function getTodayTasks() {
  const T = todayPhase();
  return [
    { key: 'mouth', name: '口部操', desc: '嘟嘴、顶腮、绕舌… 2 分钟', btn: '开始', open: openMouth },
    { key: 'rkl', name: '绕口令慢读', desc: '一个字一个字咬清楚', btn: '开读', open: openRkl },
    { key: 'read', name: '朗读 · ' + shortTitle(T.read.title), desc: '读 2 遍，再抄 1 遍', btn: '去读', open: openRead },
    { key: 'record', name: '复述录音 60 秒', desc: '合上原文，说出大意', btn: '去说', open: openRecord },
    { key: 'words', name: '烂词造句 ×3', desc: `「${T.words.cat}」`, btn: '造句', open: openWords },
    { key: 'review', name: '睡前复习闪卡', desc: '今日 3 词，想出来算过', btn: '复习', open: openReview },
  ];
}

function renderToday() {
  const day = dayIndexOf();
  const tasks = getTodayTasks();
  const t = getToday();
  const doneCount = tasks.filter(x => t.d.tasks[x.key]).length;
  $('#dayNum').textContent = `第 ${day + 1} 天`;
  $('#dayStats').textContent = `${doneCount}/${tasks.length} 完成`;
  $('#dayProgressBar').style.width = (doneCount / tasks.length * 100) + '%';
  const list = $('#taskList');
  list.innerHTML = '';
  for (const task of tasks) {
    const done = !!t.d.tasks[task.key];
    const div = document.createElement('div');
    div.className = 'task' + (done ? ' done' : '');
    div.innerHTML = `<div class="task-check">✓</div>
      <div class="task-main"><div class="task-name">${esc(task.name)}</div><div class="task-desc">${esc(task.desc)}</div></div>
      <button class="task-btn" data-key="${task.key}">${done ? '已✓' : task.btn}</button>`;
    $(`.task-btn`, div).addEventListener('click', () => task.open());
    list.appendChild(div);
  }
  const q = todayPhase().quote;
  $('#dailyQuote').textContent = q ? q.text : '';
}

function doneToast(key, tasks) {
  const doneCount = tasks.filter(x => getToday().d.tasks[x.key]).length;
  if (doneCount === tasks.length) toast('🎉 今天全部完成！明天见');
  else toast(`已完成 ${doneCount}/${tasks.length}，继续`);
}
function finishTask(key, openNext) {
  markTask(key);
  const task = getTodayTasks().find(x => x.key === key);
  renderToday(); greet();
  const tasks = getTodayTasks();
  doneToast(key, tasks);
  const next = tasks.find(x => !getToday().d.tasks[x.key]);
  if (openNext && next) { setTimeout(() => next.open(), 400); }
}

/* ---- 任务1：口部操 ---- */
const MOUTH_STEPS = [
  ['嘟嘴→咧嘴', '用力嘟嘴，再用力咧开。×10', 'mao1'],
  ['顶腮', '舌尖用力顶左腮，再顶右腮。各×10', 'mao2'],
  ['绕舌', '舌尖绕嘴唇一圈，顺时针→逆时针。各×5圈', 'mao3'],
  ['弹舌', '舌头用力弹上颚，像马蹄声。×20', 'mao4'],
  ['开牙关', '张大嘴→闭合，感受耳根酸胀。×10', 'mao5'],
];
/* SVG 动画脸：根据动作类型渲染嘴型/腮部动态 */
function mouthSVG(stage) {
  // stage: 0 嘟嘴 1 咧嘴 2 顶腮 3 绕舌 4 弹舌 5 开牙关
  const W = 200, H = 150;
  const face = `<ellipse cx="100" cy="85" rx="62" ry="58" fill="#ffd9c0" stroke="#e8590c" stroke-width="2"></ellipse>`;
  const eyes = `<circle cx="72" cy="72" r="7" fill="#5b4636"></circle><circle cx="128" cy="72" r="7" fill="#5b4636"></circle>`;
  let mouth = '';
  let anim = '';
  if (stage === 0) { // 嘟嘴
    mouth = `<ellipse cx="100" cy="112" rx="14" ry="9" fill="#c2410c"></ellipse>`;
  } else if (stage === 1) { // 咧嘴
    mouth = `<path d="M 68 110 Q 100 128 132 110" fill="none" stroke="#c2410c" stroke-width="4" stroke-linecap="round"></path><path d="M 74 112 Q 100 126 126 112" fill="#c2410c"></path>`;
  } else if (stage === 2) { // 顶腮（舌头鼓左边）
    mouth = `<path d="M 76 108 Q 100 118 124 108" fill="none" stroke="#c2410c" stroke-width="3" stroke-linecap="round"></path><circle cx="82" cy="108" r="8" fill="#e88" opacity=".85"></circle>`;
  } else if (stage === 3) { // 绕舌（舌头转动动画）
    mouth = `<circle cx="100" cy="112" r="10" fill="#e88" opacity=".9"><animate attributeName="cx" values="88;112;88" dur="1.6s" repeatCount="indefinite"></animate><animate attributeName="cy" values="106;118;106" dur="1.6s" repeatCount="indefinite"></animate></circle>`;
  } else if (stage === 4) { // 弹舌（上下弹动）
    mouth = `<circle cx="100" cy="112" r="9" fill="#e88" opacity=".9"><animate attributeName="cy" values="108;118;108" dur="0.5s" repeatCount="indefinite"></animate></circle>`;
  } else if (stage === 5) { // 开牙关（大口张开+闭合动画）
    mouth = `<path d="M 76 100 L 124 100 L 118 130 L 82 130 Z" fill="#7c2d12"><animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite"></animate></path><path d="M 76 98 Q 100 90 124 98" fill="none" stroke="#c2410c" stroke-width="3"></path>`;
  }
  return `<svg viewBox="0 0 200 150" width="200" height="150" style="margin:0 auto;display:block">${face}${eyes}${mouth}</svg>`;
}
function openMouth() {
  let i = 0;
  openSheet('口部操 · 2分钟',
    `<div id="mouthAnim" style="margin-bottom:8px"></div>
     <div class="flash-card" id="mouthStep" style="min-height:64px"></div>
     <div class="flash-hint" id="mouthHint"></div>
     <div class="rec-btn-row"><button class="rec-btn play" id="mouthNext">下一个</button></div>`,
    { onMount(m) {
      const show = () => {
        $('#mouthAnim').innerHTML = mouthSVG(i);
        $('.flash-card', m).textContent = MOUTH_STEPS[i][0];
        $('.flash-hint', m).textContent = MOUTH_STEPS[i][1];
      };
      show();
      $('#mouthNext').addEventListener('click', () => { i++; if (i >= MOUTH_STEPS.length) { closeSheet(); finishTask('mouth'); } else show(); });
    }});
}

/* ---- 任务2：绕口令 ---- */
function openRkl() {
  const item = RAOKOULING_DATA[DAY % RAOKOULING_DATA.length];
  openReader(item, '绕口令慢读', 'rkl', {
    tip: '一个字一个字咬清楚。宁可慢到被自己嫌弃，也不要含糊。',
  });
}

/* ---- 任务3：朗读素材 ---- */
function shortTitle(t) { return (t || '').replace('（节选）', '').slice(0, 14); }
function openRead() {
  const T = todayPhase().read;
  openReaderBody(T, '今日朗读', 'read', `读 2 遍 · 抄 1 遍 · 再看译文 1 遍`);
}

/* ---- 大字阅读器（绕口令 / 古文 / 八字句共用） ---- */
function openReader(item, title, taskKey, opts) {
  const T = item.kind === 'guwen' || item.text ? item : { title: item, text: item, trans: '', author: '' };
  openReaderBody({ kind: item.kind || 'text', title, text: item.text || item, trans: '', author: item.author || '', idx: 0 }, title, taskKey, opts);
}
function openReaderBody(bless, title, taskKey, opts) {
  const isG = bless.kind === 'guwen';
  const body = `<div class="mat-article">
      <h3>${esc(bless.title)}</h3>
      ${bless.author ? `<div class="au">${esc(bless.author)}</div>` : ''}
      <div class="body">${esc(bless.text)}</div>
      ${bless.trans ? `<div class="trans">${esc(bless.trans)}</div>` : ''}
      ${opts && opts.tip ? `<div class="flash-hint" style="margin-top:10px">${esc(opts.tip)}</div>` : ''}
      <div class="btns">
        <button class="btn btn-ghost" id="ttsBtn">🔊 听示范</button>
        <button class="btn btn-primary" onclick="App.__recReader('${taskKey}')">🎙 录一遍交差</button>
      </div>
    </div>`;
  openSheet(title, body, { onMount(m) {
    if (isG) { const b = $('.body', m); b.style.fontSize = '17px'; b.style.lineHeight = '2'; }
    const tts = $('#ttsBtn', m);
    if (tts) {
      if (!('speechSynthesis' in window)) { tts.style.display = 'none'; }
      else tts.addEventListener('click', () => speakText(bless.text, 0.95));
    }
  }});
}
/* TTS 朗读示例：浏览器自带语音合成 */
function speakText(text, rate) {
  if (!('speechSynthesis' in window)) { toast('此浏览器不支持朗读示例'); return; }
  try { window.speechSynthesis.cancel(); } catch (e) {}
  const u = new SpeechSynthesisUtterance(text.slice(0, 600));
  u.lang = 'zh-CN';
  u.rate = rate || 1;
  window.speechSynthesis.speak(u);
}
App.__recReader = async function (taskKey) {
  if (isWeChat || !canMedia) { toast('微信内不能录音：请在浏览器打开，或改用文字模式'); return; }
  try {
    await Recorder.start();
    const r = await Recorder.stop();
    if (!r.size) throw new Error('空录音');
    // 保存
    const blob = await saveRecording(r, taskKey === 'record' ? 'record' : 'read', taskKey);
    // 立即回听弹层
    const url = URL.createObjectURL(blob);
    openSheet('回听一下',
      `<audio class="mini" src="${url}" controls autoplay></audio>
       <p class="flash-hint">听自己——只找 1 个改进点：慢一点？还是多说一句?</p>
       <div class="btns"><button class="btn btn-primary" onclick="closeSheet()">收工</button></div>`);
    finishTask(taskKey);
  } catch (e) { toast('录音失败：' + e.message); }
};

/* ---- 录音保存 ---- */
async function saveRecording(blob, type, taskKey, extra) {
  const id = 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  await Idb.put({ id, blob, type, ts: Date.now(), date: todayStr() });
  App.recs.unshift({ id, type, date: todayStr(), ts: Date.now(), dur: Recorder.elapsed, ...extra });
  Store.set('recs', App.recs.slice(0, 300));
  return { id, blob };
}

/* ---- 任务4：复述录音（合上原文 + 自评；微信降级为文字） ---- */
function openRecord() {
  const T = todayPhase().read;
  if (isWeChat || !canMedia) {
    // 微信/不支持录音 → 文字模式（不中断打卡）
    openSheet('复述 · 文字模式（微信内）',
      `<p class="flash-hint">微信内暂不支持录音。你可以：<br>① 右上角「⋯」→ <b>在浏览器打开</b> 后录音<br>② 直接打字复述（同样算完成）</p>
       <textarea id="recText" class="mat-search" style="min-height:120px" placeholder="用你自己的话说一遍今天的文章大意…（≥20字）"></textarea>
       <div class="btns"><button class="btn btn-primary" id="recTextDone">完成 →</button></div>`,
      { onMount(m) {
        $('#recTextDone').addEventListener('click', () => {
          const t = $('#recText').value.trim();
          if (t.length < 10) { toast('多说一点，至少 10 个字'); return; }
          const d = getToday(); d.d.recText = t; Store.set('daily', App.daily);
          toast('今天复述完成 ✍️');
          closeSheet(); finishTask('record');
        });
      }});
    return;
  }
  openSheet('复述录音 · 60秒',
    `<p class="flash-hint">今天的文章是《${esc(T.title.replace('（节选）', ''))}》——<b>现在合上原文</b>，用自己的话说出大意。说完才许看原文。</p>
     <div class="rec-big">
      <div class="rec-timer" id="recTimer">0s</div>
      <div class="rec-meter"><i id="recMeterBar"></i></div>
      <div class="rec-btn-row">
        <button class="rec-btn rec" id="recBtn">🎙 开始录音</button>
        <button class="rec-btn play" id="recPlay" disabled>▶ 回听</button>
      </div>
      <div id="recRate" style="display:none">
        <div class="flash-hint">刚才流畅吗？凭感觉打个分：</div>
        <div class="btns" style="justify-content:center">
          ${[1,2,3,4,5].map(n => `<button class="btn btn-ghost bt-rate" data-n="${n}">${'★'.repeat(n)}</button>`).join('')}
        </div>
      </div>
      <div class="btns"><button class="btn btn-primary" id="recDone" style="display:none">完成 →</button></div>
     </div>`,
    { onMount(m) {
      let recState = 'idle', url = null;
      const setRate = () => {
        $('#recRate').style.display = 'block'; $('#recDone').style.display = 'inline-block';
        $$('.bt-rate', m).forEach(b => b.addEventListener('click', () => {
          const n = parseInt(b.dataset.n);
          const meta = App.recs.find(r => r.id === recId);
          if (meta) { meta.rating = n; Store.set('recs', App.recs); }
          toast(`已记录 ${n} 星 ✨`);
          b.classList.add('on');
        }));
      };
      let recId = null;
      const recBtn = $('#recBtn');
      recBtn.addEventListener('click', async () => {
        if (recState === 'idle') {
          try {
            await Recorder.start();
            Recorder.onTick = s => { $('#recTimer').textContent = s + 's'; $('#recMeterBar').style.width = Math.min(100, s / 60 * 100) + '%'; };
            recState = 'rec'; recBtn.textContent = '⏹ 结束'; recBtn.classList.add('on');
          } catch (e) { toast('无法录音：' + e.message); }
        } else if (recState === 'rec') {
          Recorder.onTick = null;
          const blob = await Recorder.stop();
          recState = 'done'; recBtn.textContent = '🎙 重录'; recBtn.classList.remove('on');
          const saved = await saveRecording(blob, 'record', 'record');
          recId = saved.id;
          url = URL.createObjectURL(blob);
          $('#recPlay').disabled = false;
          setRate();
        }
      });
      $('#recPlay').addEventListener('click', () => { if (url) { const a = new Audio(url); a.play(); } });
      $('#recDone').addEventListener('click', () => { closeSheet(); finishTask('record'); });
    }});
}

/* ---- 任务5：烂词造句 ×3 ---- */
function openWords() {
  const W = todayPhase().words;
  let i = 0;
  const card = () => {
    const row = W.rows[i];
    const words = row.to.slice(0, 6).map(w => `<button class="btn btn-ghost w-pick" data-w="${esc(w)}">${esc(w)}</button>`).join('');
    return `<div class="ai-chat">
      <div class="flash-hint">第 ${i + 1}/3 组 · 「${esc(W.cat)}」</div>
      <div class="flash-card" style="font-size:20px;min-height:84px">「${esc(row.from)}」→ 换成它！</div>
      ${words}
      <div class="flash-hint">用你选的词，说一句<b>今天的事</b>（说出口即可，不必写）</div>
      <div class="btns"><button class="btn btn-primary" id="wNext">我造句了 →</button></div>
    </div>`;
  };
  openSheet('烂词造句 ×3', card(), { onMount(m) {
    $('.w-pick', m).forEach?.(b => {});
    m.addEventListener('click', e => {
      const b = e.target.closest('.w-pick');
      if (b) { $$('.w-pick', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); toast(`选它：「${b.dataset.w}」`); }
      if (e.target.id === 'wNext') {
        i++;
        if (i >= W.rows.length) { closeSheet(); finishTask('words'); }
        else { m.querySelector('.ms-body').innerHTML = card(); m.querySelector('.ms-body').querySelectorAll('.w-pick'); }
      }
    });
    // 弱提示：下一条重挂绑定
  }});
}

/* ---- 任务6：复习闪卡 ---- */
function openReview() {
  const W = todayPhase().words;
  const words = W.rows.flatMap(r => (r.to || []).slice(0, 2));
  const list = words.length >= 3 ? words.slice(0, 5) : ['忐忑不安', '欣喜若狂', '怒不可遏'];
  let i = 0;
  const show = () => {
    const w = list[i];
    return `<div class="rec-big">
      <div class="flash-hint">睡前 1 分钟 · 这 3 个词，今天学过：</div>
      <div class="flash-card" style="font-size:22px;background:#fff">${esc(w)}</div>
      <div class="flash-hint">默念它的意思 → 用它说一句今天的事</div>
      <div class="btns"><button class="btn btn-ghost" onclick="App.__rwHint()">忘了，提示一下</button></div>
      <div class="btns"><button class="btn btn-primary" id="rwNext">想起来了 →</button></div>
    </div>`;
  };
  openSheet('睡前复习', show(), { onMount(m) {
    const bind = () => {
      const btn = $('#rwNext', m);
      btn.addEventListener('click', () => {
        i++;
        if (i >= Math.min(3, list.length)) { closeSheet(); finishTask('review'); }
        else { m.querySelector('.ms-body').innerHTML = show(); bind(); }
      });
    };
    bind();
  }});
}
App.__rwHint = () => toast('提示：它替换的是今天造句里的那个“烂词”');

/* ============ 素材页 ============ */
const MAT_TABS = [
  { id: 'read', label: '诵读' },
  { id: 'words', label: '词库' },
  { id: 'quotes', label: '句型' },
  { id: 'story', label: '故事' },
];
let matCurrent = 'read';
function renderMatTabs() {
  $('#matTabs').innerHTML = MAT_TABS.map(t => `<button class="tab-chip ${t.id === matCurrent ? 'active' : ''}" data-id="${t.id}">${t.label}</button>`).join('');
  $$('#matTabs .tab-chip').forEach(b => b.addEventListener('click', () => { matCurrent = b.dataset.id; renderMatTabs(); renderMat(); }));
}
function renderMat() {
  const c = $('#matContent');
  c.innerHTML = '';
  if (matCurrent === 'read') {
    const g = GUWEN_DATA.map((x, i) => `<div class="mat-item" data-g="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x.title)}</div><div class="mat-item-sub">${esc(x.author || '')} · ${x.text.length} 字</div></div><span class="mat-item-arrow">›</span></div></div>`).join('');
    const q = QUOTES_DATA.map((x, i) => `<div class="mat-item" data-q="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x.text)}</div><div class="mat-item-sub">${esc(x.explain)}</div></div><span class="mat-item-arrow">›</span></div></div>`).join('');
    const mx = MAOXUAN_DATA.map((x, i) => `<div class="mat-item" data-mx="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x.text)}</div><div class="mat-item-sub">毛选 · 练气势</div></div><span class="mat-item-arrow">›</span></div></div>`).join('');
    c.innerHTML = `<div class="flash-hint" style="margin-bottom:4px">📖 背诵素材 · 读 2 遍 → 抄 1 遍 → 背 1 遍</div>${g}<div class="flash-hint" style="margin:8px 0 4px">✨ 八字短句 · 练重音气口</div>${q}<div class="flash-hint" style="margin:8px 0 4px">💪 毛选口号 · 练气势（短句爆破式）</div>${mx}`;
    $$('.mat-item[data-g]', c).forEach(el => el.addEventListener('click', () => { const g = GUWEN_DATA[+el.dataset.g]; openSheet('背诵', `<div class="mat-article"><h3>${esc(g.title)}</h3><div class="au">${esc(g.author)}</div><div class="body">${esc(g.text)}</div><div class="trans">${esc(g.trans)}</div><div class="btns"><button class="btn btn-primary" onclick="App.__recReader('read')">🎙 录一遍</button></div></div>`); }));
    $$('.mat-item[data-q]', c).forEach(el => el.addEventListener('click', () => { const q = QUOTES_DATA[+el.dataset.q]; openSheet('八字短句', `<div class="mat-article"><h3>${esc(q.text)}</h3><div class="body" style="font-size:20px">${esc(q.text)}</div><div class="trans">${esc(q.explain)}</div></div>`); }));
    $$('.mat-item[data-mx]', c).forEach(el => el.addEventListener('click', () => { const x = MAOXUAN_DATA[+el.dataset.mx]; openSheet('毛选 · 练气势', `<div class="mat-article"><h3>${esc(x.text)}</h3><div class="flash-hint">大声、短促、有力。读 3 遍。</div></div>`); }));
  } else if (matCurrent === 'words') {
    c.innerHTML = `<input class="mat-search" id="wSearch" placeholder="搜烂词：如“紧张”“开心”…">
      <div class="flash-hint" style="margin:4px 0">按分类翻 · 点开一组读</div><div id="wCats"></div>`;
    renderWordCats('');
    $('#wSearch').addEventListener('input', e => renderWordCats(e.target.value.trim()));
  } else if (matCurrent === 'quotes') {
    const mf = MANFU_DATA.map((x, i) => `<div class="mat-item" data-mf="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x.title)}</div><div class="mat-item-sub">${x.items.length} 组 · 口语→雅句</div></div><span>›</span></div></div>`).join('');
    const hc = HAOCI_DATA.map((x, i) => `<div class="mat-item" data-hc="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x.text)}</div><div class="mat-item-sub">${esc(x.note)}</div></div><span>›</span></div></div>`).join('');
    c.innerHTML = `<div class="flash-hint">💬 满腹经纶 · “开心到飞起”→ 春风得意马蹄疾</div>${mf}<div class="flash-hint" style="margin:8px 0 4px">🎯 好词佳句 · 记一句用一句</div>${hc}`;
    $$('.mat-item[data-mf]', c).forEach(el => el.addEventListener('click', () => { const p = MANFU_DATA[+el.dataset.mf]; openSheet('满腹经纶', `<div class="mat-article"><h3>${esc(p.title)}</h3>${p.items.map(it => `<div class="mf-line"><b>${esc(it.plain)}</b> → <i>${esc(it.verse)}</i></div>`).join('')}<div class="flash-hint">挑最贴切的一句记住，今天就用一次</div></div>`); }));
    $$('.mat-item[data-hc]', c).forEach(el => el.addEventListener('click', () => { const x = HAOCI_DATA[+el.dataset.hc]; openSheet('好词佳句', `<div class="mat-article"><h3>${esc(x.text)}</h3><div class="trans">${esc(x.note)}</div><div class="flash-hint">晚上用它讲一件当天的事</div></div>`); }));
  } else if (matCurrent === 'story') {
    const rk = RAOKOULING_DATA.map((x, i) => `<div class="mat-item" data-rk="${i}"><div class="mat-item-head"><div class="mat-item-title">${esc(x)}</div><span>›</span></div></div>`).join('');
    const tp = TOPICS_DATA.map((x, i) => `<div class="mat-item" data-tp="${i}"><div class="mat-item-head"><div><div class="mat-item-title">${esc(x[1])}</div><div class="mat-item-sub">${esc(x[0])}</div></div><span>›</span></div></div>`).join('');
    c.innerHTML = `<div class="flash-hint">🗣 模板卡（随取随用）</div>
      <div class="mat-item" data-tpl="prep"><div class="mat-item-head"><div><div class="mat-item-title">PREP · 表达观点</div><div class="mat-item-sub">观点→理由→例子→重申</div></div><span>›</span></div></div>
      <div class="mat-item" data-tpl="story"><div class="mat-item-head"><div><div class="mat-item-title">故事公式 · 讲件事</div><div class="mat-item-sub">目标→阻碍→努力→结果→意外→转变→结局</div></div><span>›</span></div></div>
      <div class="mat-item" data-tpl="three"><div class="mat-item-head"><div><div class="mat-item-title">三秒停顿 · 开口前</div><div class="mat-item-sub">默数3秒→呼吸→说第一句</div></div><span>›</span></div></div>
      <div class="flash-hint" style="margin:8px 0 4px">🌀 绕口令</div>${rk}
      <div class="flash-hint" style="margin:8px 0 4px">🎤 30 个练习话题（抽一个就说 1 分钟）</div>${tp}`;
    const TPLS = {
      prep: ['PREP · 表达观点', '<b>观点</b> → <b>理由</b> → <b>例子</b> → <b>重申观点</b><br><br>例：我觉得大学里应该做点跟专业无关的事（观点）。因为毕业后大概率不干本行，先试错成本最低（理由）。我认识一个学长，学材料的，靠学生会练出口才，毕业进了快消（例子）。所以别把大学过成高中（重申）。'],
      story: ['故事公式 · 讲件事', '<b>目标 → 阻碍 → 努力 → 结果 → 意外 → 转变 → 结局</b><br><br>先 4 句讲清楚，熟练了再加细节。讲故事＝描述画面，不是汇报流程。'],
      three: ['三秒停顿 · 开口前', '<b>默数 3 秒（同时深呼吸）</b>→ 拿到第一个词 → 再开口。<br><br>每说完一个观点，停 1 秒。'],
    };
    c.addEventListener('click', e => {
      const it = e.target.closest('.mat-item'); if (!it) return;
      const d = it.dataset;
      if (d.tpl && TPLS[d.tpl]) openSheet(TPLS[d.tpl][0], `<div class="mat-article">${TPLS[d.tpl][1]}</div>`);
      if (d.rk !== undefined) openReader({ title: '绕口令', text: RAOKOULING_DATA[+d.rk], kind: 'text' }, '绕口令', '', {});
      if (d.tp !== undefined) openSheet('练习话题 · 说 1 分钟', `<div class="mat-article"><h3>${esc(TOPICS_DATA[+d.tp][1])}</h3><div class="flash-hint">按上面的模板说。先结论，再理由。</div><div class="btns"><button class="btn btn-primary" onclick="App.__recReader('record')">🎙 录 60 秒</button></div></div>`);
    });
  }
}
function renderWordCats(q) {
  const wrap = $('#wCats'); if (!wrap) return;
  const qq = q || '';
  let html = '';
  for (const cat of WORDS_DATA) {
    const rows = qq ? cat.rows.filter(r => r.from.includes(qq) || r.to.some(w => w.includes(qq))) : cat.rows;
    if (!rows.length) continue;
    html += `<div class="mat-item" data-cat="${esc(cat.cat)}"><div class="mat-item-head"><div class="mat-item-title">${esc(cat.cat)}</div><div class="mat-item-sub">${rows.length} 组</div></div>${qq ? '' : '<div style="font-size:12.5px;color:var(--c-sub);margin-top:6px">' + rows.slice(0, 3).map(r => `${esc(r.from)} → ${esc(r.to.slice(0, 3).join('、'))}…`).join('<br>') + '</div>'}</div>`;
  }
  wrap.innerHTML = html || '<div class="cal-empty">没有找到匹配的词</div>';
  $$('.mat-item', wrap).forEach(el => el.addEventListener('click', () => {
    const cat = WORDS_DATA.find(c => c.cat === el.dataset.cat);
    openSheet(cat ? cat.cat : '', `<div class="mat-article">${cat.rows.map(r => `<div class="mf-line"><b>${esc(r.from)}</b> → <i>${esc(r.to.join('、'))}</i></div>`).join('')}</div>
      <div class="flash-hint">挑 3 组，各说一句今天的句子 → 才能在嘴里长出来</div>`);
  }));
}

/* ============ 记录页 ============ */
function renderRecord() {
  const today = getToday();
  const doneCount = getTodayTasks().filter(x => today.d.tasks[x.key]).length;
  const totalRecs = App.recs.length;
  const totalMin = Math.round(App.recs.reduce((a, r) => a + (r.dur || 0), 0) / 60 * 10) / 10;
  $('#recSummary').innerHTML = `
    <div class="rec-sum-card"><div class="rec-sum-num">${App.state ? App.state.streak : 0}</div><div class="rec-sum-label">连续天数</div></div>
    <div class="rec-sum-card"><div class="rec-sum-num">${totalRecs}</div><div class="rec-sum-label">录音数</div></div>
    <div class="rec-sum-card"><div class="rec-sum-num">${totalMin}′</div><div class="rec-sum-label">累计开口</div></div>`;
  // 日历（当月）
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const first = new Date(y, mo, 1);
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<div class="cal-empty" style="display:none"></div>'.replace('display:none', 'grid-column:auto;background:transparent');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const rec = App.daily[date];
    const isDone = rec && Object.keys(rec.tasks).length > 0;
    cells += `<div class="cal-cell ${isDone ? 'done' : ''} ${date === todayStr() ? 'today' : ''}">${d}</div>`;
  }
  $('#recCalendar').innerHTML = cells.replace(/<div class="cal-empty" style="display:none"><\/div>/, '');
  $('#recCalendar').innerHTML = Array.from({ length: first.getDay() }, () => '<div class="cal-cell" style="background:transparent"></div>').join('') + Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1, date = `${y}-${pad(mo + 1)}-${pad(d)}`;
    const isDone = App.daily[date] && Object.keys(App.daily[date].tasks).length > 0;
    return `<div class="cal-cell ${isDone ? 'done' : ''} ${date === todayStr() ? 'today' : ''}">${d}</div>`;
  }).join('');
  // 录音列表
  const list = $('#recRecordings');
  if (!App.recs.length) { list.innerHTML = '<div class="cal-empty">还没有录音。今天录第一段！</div>'; return; }
  const TYPE = { record: '复述', read: '朗读', ai: 'AI陪练' };
  list.innerHTML = '';
  App.recs.slice(0, 40).forEach(r => {
    const div = document.createElement('div');
    div.className = 'rec-row';
    div.innerHTML = `<div class="r-date">${r.date.slice(5)}</div><div class="r-type">${TYPE[r.type] || r.type}${r.rating ? ' · ' + '★'.repeat(r.rating) : ''}</div><button class="task-btn" data-id="${r.id}">▶</button>`;
    $(`.task-btn`, div).addEventListener('click', async () => {
      const rec = await Idb.get(r.id);
      if (!rec) return toast('音频已丢失');
      const url = URL.createObjectURL(rec.blob);
      openSheet('回听', `<audio class="mini" src="${url}" controls autoplay></audio>`);
    });
    list.appendChild(div);
  });
}

/* ============ 我的页 ============ */
const BADGES = [
  { id: 'first', emoji: '🌱', name: '第1练', test: () => App.recs.length > 0 },
  { id: 'd3', emoji: '🔥', name: '连续3天', test: () => (App.state?.streak || 0) >= 3 },
  { id: 'd7', emoji: '⚡️', name: '连续7天', test: () => (App.state?.streak || 0) >= 7 },
  { id: 'd15', emoji: '🏔️', name: '连续15天', test: () => (App.state?.streak || 0) >= 15 },
  { id: 'd21', emoji: '💪', name: '连续21天', test: () => (App.state?.streak || 0) >= 21 },
  { id: 'd30', emoji: '👑', name: '连续30天', test: () => (App.state?.streak || 0) >= 30 },
  { id: 'w30', emoji: '📚', name: '造句30组', test: () => (Store.get('wordCount', 0)) >= 30 },
  { id: 'w100', emoji: '🎓', name: '造句100组', test: () => (Store.get('wordCount', 0)) >= 100 },
  { id: 'r10', emoji: '🎙️', name: '录音10段', test: () => App.recs.length >= 10 },
  { id: 'r30', emoji: '🏆', name: '录音30段', test: () => App.recs.length >= 30 },
  { id: 'gw5', emoji: '📜', name: '背古文5篇', test: () => (Store.get('readCount', 0)) >= 5 },
  { id: 'ai1', emoji: '🤖', name: 'AI点评1次', test: () => (Store.get('aiCount', 0)) >= 1 },
];
function renderMe() {
  $('#meAvatar').textContent = avatarOf(App.nick);
  $('#meName').textContent = App.nick || '未设置昵称';
  const st = App.state;
  $('#meSub').textContent = `${st ? '已坚持 ' + st.streak + ' 天 · 最长 ' + st.best + ' 天' : '今天开始第 1 天'} · 数据只存在本机`;
  const wordC = Store.get('wordCount', 0);
  const readC = Store.get('readCount', 0);
  const aiC = Store.get('aiCount', 0);
  $('#meStats').innerHTML = `
    <div class="me-stat"><div class="me-stat-n">${st?.streak || 0}</div><div class="me-stat-l">连续天数</div></div>
    <div class="me-stat"><div class="me-stat-n">${App.recs.length}</div><div class="me-stat-l">录音段数</div></div>
    <div class="me-stat"><div class="me-stat-n">${wordC}</div><div class="me-stat-l">造句组数</div></div>
    <div class="me-stat"><div class="me-stat-n">${readC}</div><div class="me-stat-l">诵读篇数</div></div>
    <div class="me-stat"><div class="me-stat-n">${aiC}</div><div class="me-stat-l">AI点评</div></div>
    <div class="me-stat"><div class="me-stat-n">${st?.best || 0}</div><div class="me-stat-l">最长连击</div></div>`;
  $('#meBadges').innerHTML = BADGES.map(b => `<div class="me-badge ${b.test() ? '' : 'locked'}"><span class="emoji">${b.emoji}</span><span>${b.name}</span></div>`).join('');
  // AI 配置
  const ai = Store.get('ai', { provider: 'deepseek', key: '', model: '' });
  $('#meAiConfig').innerHTML = `
    <div class="rec-btn-row">
      <button class="rec-btn play ${ai.provider === 'deepseek' ? 'on' : ''}" style="${ai.provider === 'deepseek' ? '' : 'opacity:.5'}" id="aiDs">DeepSeek</button>
      <button class="rec-btn play ${ai.provider === 'doubao' ? 'on' : ''}" style="${ai.provider === 'doubao' ? '' : 'opacity:.5'}" id="aiDb">豆包</button>
    </div>
    <input class="mat-search" id="aiKey" placeholder="粘贴 API Key（存本机，不上传）" value="${esc(ai.key)}">
    <div class="rec-btn-row">
      <button class="btn-ghost" id="aiTest">🔌 测试连接</button>
      <button class="btn-ghost" id="aiGo">🤖 去 AI 陪练</button>
    </div>
    <div class="about-tip">点评请求直接发往 AI 服务商，不经任何中间服务器。</div>`;
  $('#aiKey').addEventListener('input', e => { ai.key = e.target.value.trim(); Store.set('ai', ai); });
  $('#aiDs').addEventListener('click', () => { ai.provider = 'deepseek'; Store.set('ai', ai); renderMe(); });
  $('#aiDb').addEventListener('click', () => { ai.provider = 'doubao'; Store.set('ai', ai); renderMe(); });
  $('#aiTest').addEventListener('click', () => window.Ai && Ai.test());
  $('#aiGo').addEventListener('click', () => { if (!ai.key) return toast('请先粘贴 API Key'); openAiSession(); });
  // 提醒设置
  const remind = Store.get('remind', '');
  $('#meRemind').innerHTML = `
    <input class="mat-search" id="remindTime" type="time" value="${esc(remind)}">
    <button class="btn-ghost" id="remindGo">开启提醒</button>
    <div class="about-tip">建议同时在手机设一个 21:00 的闹钟兜底（浏览器通知在 App 未打开时不可靠）。</div>`;
  $('#remindGo').addEventListener('click', () => {
    const v = $('#remindTime').value;
    if (!v) return toast('先选时间');
    Store.set('remind', v);
    if ('Notification' in window) {
      if (Notification.permission === 'granted') { toast('提醒已设置：' + v); scheduleRemind(v); }
      else Notification.requestPermission().then(p => { if (p === 'granted') { toast('提醒已设置：' + v); scheduleRemind(v); } else toast('浏览器通知被拒：请用手机闹钟兜底'); });
    } else toast('此浏览器不支持通知：请用手机闹钟兜底');
  });
}
function scheduleRemind(time) {
  const [h, mi] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date(now); next.setHours(h, mi, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    const today = getToday();
    const left = getTodayTasks().filter(x => !today.d.tasks[x.key]).length;
    if (left > 0 && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('开口30天', { body: `今天还有 ${left} 项没完成，趁睡前 10 分钟。`, icon: 'icons/icon-192.png' });
    }
    scheduleRemind(time);
  }, next - now);
}

/* ---- AI 陪练会话 ---- */
let aiMsgs = [];
async function openAiSession() {
  aiMsgs = [];
  const tp = TOPICS_DATA[Math.floor(Math.random() * TOPICS_DATA.length)];
  openSheet('AI 陪练',
    `<div class="ai-chat" id="aiChat">
      <div class="ai-msg bot">随机话题：<b>${esc(tp[1])}</b><br><br>你有 3 种方式：<br>① 点下方录音，说 60 秒<br>② 打字粘贴你说的话<br>③ 直接点「随便再来一个」换题</div>
    </div>
    <div class="rec-btn-row"><button class="rec-btn rec" id="aiRec">${(isWeChat || !canMedia) ? '✍️ 文字输入' : '🎙 说 60 秒'}</button></div>
    <input class="mat-search" id="aiText" placeholder="或者粘贴你刚才说的话（≥30字）">
    <div class="rec-btn-row">
      <button class="btn-ghost" id="aiSubmit">发送给 AI</button>
      <button class="btn-ghost" id="aiAnother">🎲 换话题</button>
    </div>`,
    { onMount(m) {
      let recording = false;
      $('#aiRec').addEventListener('click', async () => {
        if (isWeChat || !canMedia) { toast('微信内不能录音，请直接打字粘贴你的话'); const t = $('#aiText'); if (t) t.focus(); return; }
        if (!recording) {
          try { await Recorder.start(); recording = true; $('#aiRec').textContent = '⏹ 结束'; }
          catch (e) { toast('无法录音：' + e.message); }
        } else {
          const blob = await Recorder.stop(); recording = false; $('#aiRec').textContent = '🎙 说 60 秒';
          const saved = await saveRecording(blob, 'ai', 'ai');
          const text = await Ai.transcribe(blob);
          if (text) { $('#aiText').value = text; toast('转写完成（可修改后再发）'); submitAi(text); }
          else { toast('没能自动转写，请手动粘贴/输入你的话'); }
        }
      });
      $('#aiSubmit').addEventListener('click', () => {
        const t = $('#aiText').value.trim();
        if (t.length < 20) return toast('太短了，至少说 20 个字');
        submitAi(t);
      });
      $('#aiAnother').addEventListener('click', () => {
        const tp2 = TOPICS_DATA[Math.floor(Math.random() * TOPICS_DATA.length)];
        $('#aiChat').innerHTML += `<div class="ai-msg bot">换话题：<b>${esc(tp2[1])}</b>（说 60 秒 / 打字粘贴）</div>`;
      });
      async function submitAi(text) {
        $('#aiChat').innerHTML += `<div class="ai-msg user">${esc(text)}</div>`;
        $('#aiChat').innerHTML += `<div class="ai-msg bot">… 点评中</div>`;
        try {
          const t0 = performance.now();
          const out = await Ai.feedback(text, tp[1]);
          const cost = ((performance.now() - t0) / 1000).toFixed(1);
          $('#aiChat').innerHTML = $('#aiChat').innerHTML.replace(/… 点评中<\/div>/, '');
          $('#aiChat').innerHTML += `<div class="ai-msg bot">${out}</div>`;
          Store.set('aiCount', (Store.get('aiCount', 0)) + 1);
          renderMe();
          toast(`点评完成 · ${cost}s`);
          $('.ms-body', m).scrollTop = $('.ms-body', m).scrollHeight;
        } catch (e) {
          $('#aiChat').innerHTML = $('#aiChat').innerHTML.replace(/… 点评中<\/div>/, '');
          toast('AI 调用失败：' + e.message);
        }
      }
    }});
}

/* ============ 页面切换 ============ */
function showWeChatBanner() {
  // 微信内：显示顶部红色提示条（在 topbar 下方）
  let banner = $('#wcBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'wcBanner';
    banner.style.cssText = 'background:#fff3cd;color:#856404;padding:10px 14px;font-size:13px;line-height:1.6;border-bottom:1px solid #ffe69c';
    banner.innerHTML = `⚠️ 微信内不能录音/播放。建议：右上角「⋯」→ <b>在浏览器打开</b>，功能才完整。`;
    $('#topbar').after(banner);
  }
}
function showPage(p) {
  App.page = p;
  $$('.page').forEach(x => x.classList.toggle('active', x.id === 'page-' + p));
  $$('#tabbar .tab').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  if (p === 'today') { renderToday(); greet(); }
  if (p === 'material') { renderMatTabs(); renderMat(); }
  if (p === 'record') renderRecord();
  if (p === 'me') renderMe();
}

/* ============ 初始化 ============ */
function init() {
  ensureState();
  const t = getToday(); // 创建今日占位
  if (isWeChat) showWeChatBanner();
  if (!App.nick) openGuide();
  showPage('today');
  setupGlobal();
}
function setupGlobal() {
  $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
  $('#tbMenu').addEventListener('click', () => { App.page === 'today' ? showPage('material') : showPage('today'); });
  $('#btnNickname').addEventListener('click', () => {
    const w = prompt('给自己起个昵称（显示在首页）：', App.nick || '');
    if (w !== null && w.trim()) { App.nick = w.trim().slice(0, 8); Store.set('nick', App.nick); greet(); renderMe(); toast('昵称已更新'); }
  });
  $('#btnShare').addEventListener('click', shareApp);
  $('#btnExport').addEventListener('click', exportData);
  $('#btnReset').addEventListener('click', () => {
    if (confirm('确定重置计划？所有打卡和录音记录将被清空（不可恢复）。')) {
      localStorage.clear();
      indexedDB.deleteDatabase('kk30-db');
      location.reload();
    }
  });
  // 首日 vs 今天
  $('#recAnchorBtn').addEventListener('click', () => {
    const recs = App.recs.filter(r => r.type === 'record');
    if (recs.length < 2) return toast('至少要有两段复述录音（如第 1 天和现在）才能对比');
    const first = recs[recs.length - 1], last = recs[0];
    Promise.all([Idb.get(first.id), Idb.get(last.id)]).then(([a, b]) => {
      openSheet('首日 VS 今天',
        `<div class="flash-hint">${first.date} 的第 1 段</div><audio class="mini" src="${URL.createObjectURL(a.blob)}" controls></audio>
         <div class="flash-hint">${last.date} 的最近一段</div><audio class="mini" src="${URL.createObjectURL(b.blob)}" controls></audio>
         <div class="flash-hint">🌟 听差别：停顿变多了吗？急冲感降了吗？</div>`);
    });
  });
}
function shareApp() {
  const url = 'https://kaikou30.pages.dev';
  const text = '👇 每天 30 分钟练表达｜朗读、复述、AI 点评｜数据存你自己手机\n' + url;
  if (navigator.share) navigator.share({ title: '开口30天', text, url }).catch(() => {});
  else { navigator.clipboard.writeText(text).then(() => toast('链接已复制，发给朋友吧')).catch(() => prompt('复制链接：', url)); }
}
function exportData() {
  const blob = new Blob([JSON.stringify({ state: App.state, daily: App.daily, recs: App.recs, nick: App.nick }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'kaikou30-backup-' + todayStr() + '.json'; a.click();
  toast('备份已下载（不包含录音音频）');
}

/* ---- 首次引导 ---- */
function openGuide() {
  const steps = [
    ['👋', '这是什么', '每天 25 分钟，跟着「今日」页练 6 件事：口部操→绕口令→朗读→复述→烂词造句→睡前复习。'],
    ['📲', '30 天见效', '先练结构、再练词汇、再练胆量。30 天后你会：开口不空白，说得慢、说得全。'],
    ['🔒', '你的数据只在你手机里', '没有账号、没有云同步。打卡和录音都存在本机，谁也不上传。'],
  ];
  let i = 0;
  const render = () => {
    const s = steps[i];
    return `<div class="congrats"><div class="big">${s[0]}</div><h2>${s[1]}</h2><p>${s[2]}</p></div>
      <div class="flash-hint">${i + 1}/${steps.length}</div>
      <div class="btns"><button class="btn btn-primary" id="gNext">${i === steps.length - 1 ? '开始！' : '下一步 →'}</button></div>`;
  };
  openSheet('欢迎使用 开口30天', render(), { onMount(m) {
    const bind = () => {
      $('#gNext').addEventListener('click', () => {
        i++;
        if (i >= steps.length) {
          const w = prompt('给自己起个昵称（也可留空，随时可改）', '');
          if (w) { App.nick = w.trim().slice(0, 8); Store.set('nick', App.nick); }
          closeSheet(); greet(); renderMe();
        } else { m.querySelector('.ms-body').innerHTML = render(); bind(); }
      });
    };
    bind();
  }});
}

/* ---- 启动 ---- */
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
});
