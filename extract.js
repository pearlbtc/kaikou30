// extract.js — 从 Obsidian 笔记库抽取素材，生成 data/*.js 数据包
// 运行: node extract.js
const fs = require('fs');
const path = require('path');
const SRC = 'D:/Obsidian/工作笔记/业余/读书';
const OUT = path.join(__dirname, 'data');
fs.mkdirSync(OUT, { recursive: true });

const read = p => fs.readFileSync(p, 'utf8');
const js = (name, data) =>
  `// 由 extract.js 生成，勿手改。来源: Obsidian 读书库\nwindow.${name} = ${JSON.stringify(data, null, 0)};\n`;

/* ---------- 1. 烂词替换 1500 组 ---------- */
const raw = read(`${SRC}/输出/烂词替换.md`);
let cat = '';
const wordList = [];
{
  let curCat = null, curRows = [];
  for (const line of raw.split('\n')) {
    if (/^## /.test(line)) { if (curCat && curRows.length) wordList.push({ cat: curCat, rows: curRows }); curCat = line.replace(/^## /, '').replace(/^[^ ]+ /, '').trim(); curRows = []; continue; }
    const row = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line.trim());
    if (row && row[2] !== '№' && row[3] !== '✨ 替换为') curRows.push({ no: parseInt(row[1]), from: row[2].trim(), to: row[3].split(/[、，,]/).map(s => s.trim()).filter(Boolean) });
  }
  if (curCat && curRows.length) wordList.push({ cat: curCat, rows: curRows });
}
/* 跳过不含数据的分类（如带注释行的）按内容判断 */
fs.writeFileSync(`${OUT}/words.js`, js('WORDS_DATA', wordList.filter(c => c.rows.length > 0)));
console.log(`烂词替换: ${wordList.reduce((a, c) => a + c.rows.length, 0)} 组 / ${wordList.length} 分类`);

/* ---------- 2. 八字短句 ---------- */
const rmb = read(`${SRC}/读书相关资料、链接/《人民日报》经典八字短句60句，熟悉运用，立马彰显“腹有诗书气自华”的气质.md`);
const o = [];
{
  let cur = null;
  for (const line of rmb.split('\n')) {
    const t = line.trim();
    const mm = /^(\d{2})\s*(.+)$/.exec(t);
    if (mm && !/^【/.test(mm[2]) && mm[2].length < 40) { if (cur) o.push(cur); cur = { text: mm[2].trim(), explain: '' }; continue; }
    const ex = /^【释义】(.+)$/.exec(t);
    if (ex && cur) (cur.explain = ex[1].trim());
  }
  if (cur) o.push(cur);
}
fs.writeFileSync(`${OUT}/quotes.js`, js('QUOTES_DATA', o));
console.log(`八字短句: ${o.length} 句`);

/* ---------- 3. 必背古文 10 篇 ---------- */
const gw = read(`${SRC}/读书相关资料、链接/必须全文背诵！10篇200字内的极致古文，篇篇封神.md`);
const gwo = [];
{
  let cur = null;
  for (const line of gw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d{2}$/.test(t)) {
      if (cur && cur.text) gwo.push(cur);
      cur = { no: parseInt(t), title: '', author: '', text: '', trans: '', mode: 'text' };
      continue;
    }
    if (!cur) continue;
    if (!cur.title && /^《.+$/.test(t)) { cur.title = t; continue; }
    if (/^译文[：:]?$/.test(t)) { cur.mode = 'trans'; continue; }
    if (cur.mode === 'text' && !cur.author && t.length <= 24 && !/^[>=—\-]/.test(t) && !/^译文/.test(t)) { cur.author = t; continue; }
    if (t.startsWith('>')) {
      const body = t.replace(/^>\s?/, '');
      if (cur.mode === 'trans') cur.trans += body + ' ';
      else cur.text += body + ' ';
    }
  }
  if (cur && cur.text) gwo.push(cur);
}
fs.writeFileSync(`${OUT}/guwen.js`, js('GUWEN_DATA', gwo));
console.log(`古文: ${gwo.length} 篇`);

/* ---------- 4. 满腹经纶（精选前 10 篇） ---------- */
const mf = read(`${SRC}/输出/满腹经纶1000句.md`);
const mfo = [];
let curP = null;
for (const line of mf.split('\n')) {
  const t = line.trim();
  const p = /^## (第\d+篇)\s*(.*)$/.exec(t);
  if (p) { if (curP) mfo.push(curP); curP = { title: `${p[1]} · ${p[2]}`, items: [] }; continue; }
  if (!curP) continue;
  const it = /^- (\d+)\. 「(.+?)」→ (.+?)$/.exec(t);
  if (it) curP.items.push({ no: parseInt(it[1]), plain: it[2], verse: it[3] });
}
if (curP) mfo.push(curP);
fs.writeFileSync(`${OUT}/manfu.js`, js('MANFU_DATA', mfo));
console.log(`满腹经纶: ${mfo.length} 篇 / ${mfo.reduce((a, c) => a + c.items.length, 0)} 句`);

/* ---------- 5. 好词佳句（妙句+金句） ---------- */
const hj = read(`${SRC}/输出/好词佳句.md`);
const hjo = [];
for (const line of hj.split('\n')) {
  const t = line.trim();
  const mm = /^-\s*\*\*(.+?)\*\* ?[—-] ?(.*)$/.exec(t);
  if (mm && mm[2]) hjo.push({ text: mm[1], note: mm[2] || '' });
  else if (mm) hjo.push({ text: mm[1], note: '' });
}
fs.writeFileSync(`${OUT}/haoci.js`, js('HAOCI_DATA', hjo));
console.log(`好词佳句: ${hjo.length} 条`);

/* ---------- 6. 毛选核心金句（10条） ---------- */
const mx = read(`${SRC}/毛选/《毛选》10 大金句，道破天机，你不可不知.md`);
const mxo = [];
for (const line of mx.split('\n')) {
  const mm = /^### \d+、金句\S*：(.+)$/.exec(line.trim());
  if (mm) mxo.push({ text: mm[1].trim() });
}
fs.writeFileSync(`${OUT}/maoxuan.js`, js('MAOXUAN_DATA', mxo));
console.log(`毛选金句: ${mxo.length} 条`);

/* ---------- 7. 绕口令（从训练方案文件） ---------- */
const rkl = [
  '四是四，十是十，十四是十四，四十是四十',
  '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮',
  '粉红墙上画凤凰，凤凰画在粉红墙',
  '扁担长板凳宽，扁担想绑在板凳上',
  '八百标兵奔北坡，炮兵并排北边跑',
];
fs.writeFileSync(`${OUT}/raokouling.js`, js('RAOKOULING_DATA', rkl));

/* ---------- 8. 30 个练习话题 ---------- */
const topics = [
  ['第1周·观点', '你觉得早起好还是熬夜好？'], ['第1周·观点', '你最喜欢的电影/游戏是什么？为什么？'],
  ['第1周·观点', '手机应该被禁止带进课堂/会议室吗？'], ['第1周·观点', '你觉得外向的人更容易成功吗？'],
  ['第1周·观点', '上学/上班前应该先休学一年去旅行吗？'], ['第1周·观点', '你更喜欢网上购物还是去实体店？'],
  ['第1周·观点', '团队合作中，能力重要还是态度重要？'], ['第2周·故事', '讲一次你迟到/赶车的经历'],
  ['第2周·故事', '讲一件今天发生的开心小事'], ['第2周·故事', '讲一次你出糗的经历'],
  ['第2周·故事', '讲一次你帮别人或被别人帮的事'], ['第2周·故事', '讲你最喜欢的一部电影的情节（3分钟内）'],
  ['第2周·故事', '讲一个你印象最深的路人/陌生人'], ['第2周·故事', '讲一件你后悔的事'],
  ['第3周·描述', '描述你房间/办公桌的一角（30秒）'], ['第3周·描述', '描述今天的天气和你的感受'],
  ['第3周·描述', '描述你最喜欢的一道菜（让人听完就想吃）'], ['第3周·描述', '描述你学校/公司最吵的地方'],
  ['第3周·描述', '描述你最近见到的一个人'], ['第3周·描述', '描述一个你熟悉的城市角落'],
  ['第3周·描述', '描述你的手机（30秒，不许只说品牌型号）'], ['第4周·即兴', '如果今天是你人生最后一天，你会做什么？'],
  ['第4周·即兴', '给10年前的自己一句忠告'], ['第4周·即兴', '你养的第一只宠物（或想养的）会是什么？'],
  ['第4周·即兴', '如果可以瞬间学会一项技能，你选什么？'], ['第4周·即兴', '你最近学到的一个新东西'],
  ['第4周·即兴', '你崇拜的一个人，为什么崇拜他？'], ['第4周·即兴', '向大家推荐一本/一部你最近看的'],
  ['第4周·即兴', '你生命中最大的一次改变是什么？'], ['第4周·即兴', '自由题：今天轮到你“说点什么”'],
];
fs.writeFileSync(`${OUT}/topics.js`, js('TOPICS_DATA', topics));

console.log('\n全部完成 ✓');
