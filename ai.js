/* 开口30天 — AI 陪练：语音转写 + DeepSeek/豆包 点评 */
'use strict';

const Ai = {
  PROVIDERS: {
    deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', fallbackModel: 'deepseek-chat' },
    doubao: { label: '豆包', base: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: '', fallbackModel: 'doubao-seed-1-6-250615' },
  },
  lastText: '',

  cfg() { return Store.get('ai', { provider: 'deepseek', key: '', model: '' }); },

  /* ---------- 语音转写（Web Speech API，尽力而为） ---------- */
  transcribe(blob) {
    // 方式1：Web Speech API 实时识别（仅部分浏览器可用）
    return new Promise(res => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return res('');
      const rec = new SR();
      rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 1;
      let out = '';
      rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) out += e.results[i][0].transcript; };
      rec.onerror = () => res(out);
      rec.onend = () => res(out.trim());
      try { rec.start(); } catch (e) { res(''); }
      setTimeout(() => { try { rec.stop(); } catch (e) {} }, Math.min(60000, (this.lastDur || 30) * 1200));
    });
    // 注：blob 参数保留——未来可换 Whisper-based 转写；当前用实时识别替代
  },

  /* ---------- 点评 ---------- */
  async feedback(text, topic) {
    const cfg = this.cfg();
    if (!cfg.key) throw new Error('未设置 API Key（我的页 → AI陪练）');
    const p = this.PROVIDERS[cfg.provider];
    if (!p) throw new Error('未知服务商');

    const model = cfg.model || p.model || p.fallbackModel;
    const sys = `你是中国一名温和专业的演讲教练。用户正在练习口语表达（话题：${topic || '随机话题'}）。
请严格按以下格式点评（总共不超过150字，用中文）：
一、优点：一句具体的好
二、可提升：一句具体的改进点（只给最重要的1条）
三、换个说法：用一句话示范怎么说更有画面/更有结构
语气鼓励，不说空话，不写大段道理。`;
    const body = {
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: text.slice(0, 1200) },
      ],
      temperature: 0.4,
      max_tokens: 300,
    };

    const resp = await fetch(p.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data.error && data.error.message) || ('HTTP ' + resp.status);
      throw new Error(msg.slice(0, 80));
    }
    const out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!out) throw new Error('AI 返回为空');
    return out;
  },

  /* ---------- 测试连接 ---------- */
  async test() {
    const cfg = this.cfg();
    if (!cfg.key) return toast('请先粘贴 API Key');
    toast('测试中…');
    try {
      const out = await this.feedback('今天练习，先试一下连接。', '测试');
      toast('连接成功 ✓（已收到回复）');
    } catch (e) { toast('连接失败：' + e.message); }
  },
};

/* 暴露给 app.js */
window.Ai = Ai;
