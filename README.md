# 开口30天（PWA）

每天 30 分钟，练出有条理的表达。基于《表弟沟通表达30天训练计划》开发。

## 功能
- **今日**：口部操 → 绕口令慢读 → 朗读 → 复述录音 → 烂词造句×3 → 睡前复习闪卡，6 项任务打卡
- **素材库**：必背古文 10 篇、人民日报八字短句 60 句、烂词替换 1,485 组（79 分类）、满腹经纶 979 句、好词佳句 122 条、毛选金句 10 条、绕口令 5 条、30 个练习话题、4 张模板卡
- **记录**：打卡日历、录音列表、首日 VS 今天对比
- **我的**：连续天数、徽章墙（12枚）、AI 陪练（DeepSeek/豆包）
- 数据全部存在本机（localStorage + IndexedDB），无账号、无服务器、可离线

## 技术
纯静态前端（HTML/CSS/JS，零框架），PWA（manifest + Service Worker 离线缓存），Web Speech API 语音转写（iOS 降级为文字输入）。

## 运行
```bash
# 本地预览
python -m http.server 8123
# 或
npx serve .

# 冒烟测试（需 npm i jsdom）
node test-smoke.js
```

## 部署（Cloudflare Pages）
1. 推送代码到 GitHub 仓库（建议私有）
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. 选择该仓库，构建设置：Build command 留空，Build output directory 填 `.`（根目录）
4. Deploy → 得到 `https://xxx.pages.dev` 链接
5. 把链接写给朋友，手机浏览器打开 → 菜单"添加到主屏幕"即变 App

## AI 陪练（可选）
我的页 → AI 陪练 → 选 DeepSeek（推荐）/豆包 → 粘贴 API Key（存本机，请求直连服务商，不经服务器）。
DeepSeek：https://platform.deepseek.com 注册，充值 ¥10 可用几百次。

## 素材来源
数据包由 `extract.js` 从 Obsidian 库（`D:\Obsidian\工作笔记\业余\读书`）抽取生成，勿手改 `data/*.js`。
需要更新的素材重新生成：`node extract.js`。
