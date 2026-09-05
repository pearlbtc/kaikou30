// test-smoke.js — 完整冒烟测试（模拟真实 <script> 执行）
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dataFiles = ['words', 'quotes', 'guwen', 'manfu', 'haoci', 'maoxuan', 'raokouling', 'topics'];
const inline = dataFiles.map(f => `<script>${fs.readFileSync('data/' + f + '.js', 'utf8')}</script>`).join('\n');
const aiJs = fs.readFileSync('ai.js', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');

// 构造真实 HTML：数据内联，ai.js/app.js 也内联执行
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script src="data\/[^"]+"><\/script>/g, '')
           .replace(/<script src="data\/words\.js"><\/script>/, inline)
           .replace(/<script src="ai\.js"><\/script>/, `<script>${aiJs}</script>`)
           .replace(/<script src="app\.js"><\/script>/, `<script>${appJs}</script>`);

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost:8123/', pretendToBeVisual: true });
const w = dom.window;
// shims（脚本执行前就位）
w.URL.createObjectURL = () => 'blob:fake';
w.URL.revokeObjectURL = () => {};
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
w.confirm = () => true;
w.prompt = (n, d) => (d || '');
w.Notification = function () {};
w.Notification.permission = 'granted';
w.Notification.requestPermission = () => Promise.resolve('granted');

const d = w.document;
const ok = (name, cond) => console.log((cond ? '✓' : '✗'), name);
const click = s => { const el = d.querySelector(s); if (!el) { ok('找不到 ' + s, false); return; } el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };

setTimeout(() => {
  try {
    ok('今日任务 6', d.querySelectorAll('.task').length === 6);
    ok('dayNum 第1天', /第 1 天/.test(d.querySelector('#dayNum').textContent));
    ok('今日金句非空', d.querySelector('#dailyQuote').textContent.length > 2);

    click('.tab[data-page=material]');
    ok('素材tabs 4', d.querySelectorAll('#matTabs .tab-chip').length === 4);
    ok('诵读items>=22', d.querySelectorAll('.mat-item').length >= 22);

    click('.tab-chip[data-id=words]');
    ok('词库分类>=70', d.querySelectorAll('#wCats .mat-item').length >= 70);
    const search = d.querySelector('#wSearch');
    ok('词库搜索框', !!search);
    if (search) { search.value = '紧张'; search.dispatchEvent(new w.Event('input', { bubbles: true })); }
    ok('搜索[紧张]有结果', d.querySelectorAll('#wCats .mat-item').length >= 1);

    click('.tab-chip[data-id=quotes]');
    ok('句型items>150', d.querySelectorAll('.mat-item').length > 150);
    click('.tab-chip[data-id=story]');
    ok('故事页>35', d.querySelectorAll('.mat-item').length > 35);

    click('.tab[data-page=record]');
    ok('记录页3卡', d.querySelectorAll('.rec-sum-card').length === 3);
    click('.tab[data-page=me]');
    ok('徽章12', d.querySelectorAll('.me-badge').length === 12);
    click('.tab[data-page=today]');

    // 完成口部操：点按钮→弹层→下一个×5
    click('.task .task-btn');
    ok('口部操弹层出现', !!d.querySelector('#mouthStep'));
    for (let i = 0; i < 5; i++) { const b = d.querySelector('#mouthNext'); if (!b) break; b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
    ok('口部操后 task.done', d.querySelectorAll('.task.done').length >= 1);

    // 烂词造句弹层
    const wBtn = Array.from(d.querySelectorAll('.task .task-btn')).find(b => b.textContent.includes('造句'));
    if (wBtn) wBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('造句弹层卡片', !!d.querySelector('.flash-card'));
    const wNext = d.querySelector('#wNext');
    ok('造句下一步按钮', !!wNext);
    if (wNext) { wNext.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
    // 复习闪卡弹层
    const rBtn = Array.from(d.querySelectorAll('.task .task-btn')).find(b => b.textContent.includes('复习'));
    if (rBtn) rBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('复习弹层卡片', !!d.querySelector('.flash-card'));
    console.log('== 冒烟测试完成 ==');
    process.exit(0);
  } catch (e) { console.log('✗ 检查错误:', e.message); process.exit(1); }
}, 300);
