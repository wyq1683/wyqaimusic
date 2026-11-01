# UI 规则手册 — 弹层选型 / 细节参数 / 表单控件

> 来源：Ludi486「高定 UI」系列（2026-11，小红书），已转写为可执行规则，不是金句摘抄。
> 用法：动界面前先过 §0 选型表，再按 §1–§3 落数值，提交前过 §5 自查清单。
> 相关：`项目指令-v2.md`（部署/发版流程）、`开发实现与踩坑文档.md`（历史坑）

---

## 0. 弹出层选型：先选对组件，再谈样式

**叫错名字，就会选错组件。**「加个弹窗」是最容易导致返工的一句话。

| 场景 | 用哪个 | 一句话判据 | 禁忌 |
|---|---|---|---|
| 移动端半屏：筛选、评论、详情 | **Bottom Sheet** | 手机半屏拉 | 桌面端不要用，改 Drawer |
| 底部一组操作：分享、删除、更多 | **ActionSheet** | 底部选操作 | 操作超过 6 个先分组 |
| 操作完成后的后悔药 | **Snackbar** | 发后悔药，带「撤销」 | 不要用它承载必须看到的信息 |
| 不可逆高危：删除账号、清空 | **AlertDialog** | 高危锁死，显式确认 | 禁止点遮罩关闭、禁止默认聚焦危险按钮 |
| 首次使用引导 | **Tour** | 新手指引，分步高亮 | 必须可跳过，且只出现一次 |
| 悬停解释 | **Tooltip** | 悬停小学 | 不承载「必须知道」的信息（触屏没有 hover） |
| 轻量反馈 | **Toast** | 一闪而过 | 不拦截、不堆叠超过 2 条 |
| 霸屏强任务：登录、支付 | **Modal** | 霸屏拦截 | 一屏只允许一层拦截式弹层 |
| 高频小确认：删单行、解绑 | **Popconfirm** | 贴着操作对象，不打断 | 不要为它开全屏遮罩 |
| 边看边改：详情、设置 | **Drawer** | 边看边改拉抽屉 | 宽度 > 82% 时应自动切换为全屏 |

**原文口诀（记这个就够）**

- 手机半屏拉 → Bottom Sheet
- 底部选操作 → ActionSheet
- 发后悔药 → Snackbar
- 高危锁死 → AlertDialog
- 新手指引 → Tour

**三条硬约束**

1. 同一时刻只允许 **一层** 拦截式弹层（Modal / AlertDialog）；Toast、Snackbar 不算拦截层，但也不要和 Modal 同时抢注意力。
2. 遮罩点击是否关闭：高危操作 **禁止**；表单类关闭前必须问「放弃编辑？」。
3. 弹层宽度与断点：移动端 Bottom Sheet 高度不超过 90dvh；桌面 Modal 宽 `min(460px, 92vw)`，超过 640px 的信息用 Drawer 而不是 Modal。

---

## 1. 高定 UI 十条（带数值）

### 1.1 禁黑框、禁纯黑，靠微明度分层
不要 `border: 1px solid #000`，也不要大面积 `#000`。深色界面用 **4 层 1–3% 的微明度差** 分层：

```css
:root{
  --bg-0:#0a0b10;                 /* 画布 */
  --bg-1:#0e1017;                 /* 区块 */
  --bg-2:#12151d;                 /* 卡片 */
  --bg-3:#171b25;                 /* 浮层 */
  --hairline: rgba(255,255,255,.06);
  --hairline-strong: rgba(255,255,255,.10);
}
```

### 1.2 输入框聚焦：不描边，用双环阴影
`outline` / `border-color` 变化会引起 1px 位移；改用内阴影 + 外发光：

```css
.input:focus-visible{
  outline: none;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.14),     /* 内环：替代边框 */
    0 0 0 3px color-mix(in oklab, var(--accent) 28%, transparent); /* 外环：焦点 */
}
```

### 1.3 暗色下字重要降一档
亮色 700 的标题放到暗色里会「糊成一块」（字形膨胀）。做法：把字重做成变量，暗色整体降一档，而不是逐处改。

```css
body[data-theme="dark"]{ --fw-strong:600; --fw-title:650; --fw-body:380; }
h1,h2,.title{ font-weight: var(--fw-title); }
```

### 1.4 流式打字：blur(6px) → 0，120ms，字间错开 30ms

```css
.tk{ display:inline-block; animation: tk-in .12s ease-out both; animation-delay: calc(var(--i) * 30ms); }
@keyframes tk-in{ from{ opacity:0; filter:blur(6px); transform:translateY(2px);} to{ opacity:1; filter:blur(0);} }
```
JS 侧只需渲染 `<span class="tk" style="--i:0">字</span>`。

### 1.5 图标与文字视觉对齐：下移 0.125em
SVG 的视觉重心比文字基线高，浏览器不会自动补偿：

```css
.btn svg, .item svg { transform: translateY(0.125em); }
```

### 1.6 数字锁定等宽，防抖动
计时器、价格、表格列、进度时间：

```css
.num, .time, td.num { font-variant-numeric: tabular-nums; }
```

### 1.7 折叠动画用 Grid 的 0fr → 1fr
`height:auto` 不可动画，`max-height` 猜不准。用 grid 轨道：

```css
.fold{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .28s var(--ease-out); }
.fold.on{ grid-template-rows:1fr; }
.fold > div{ overflow:hidden; min-height:0; }
```

### 1.8 正文 text-wrap: pretty（标题用 balance）
避免最后一行只剩一个字：

```css
p, .desc { text-wrap: pretty; }
h1, h2, .title { text-wrap: balance; }
```

### 1.9 弹簧参数：拖拽 1200/80 零回弹，点赞 380/18 微弹
- 拖拽 / 排序：`stiffness 1200, damping 80`，**过冲为零**，不能有回弹
- 点赞 / 收藏：`stiffness 380, damping 18`，一次轻微过冲即停
- CSS 近似：`transition: transform .18s cubic-bezier(.2,1,.3,1)`；需要真弹簧用 framer-motion 的 `useSpring`。

### 1.10 复制反馈 2.5 秒自隐
点「复制」→ 图标换成对勾 → **2.5s** 后恢复，不要弹 Toast（复制是低风险动作，Toast 太重）。

---

## 2. 聊天 / 输入类界面六条

### 2.1 中文输入法选字时，回车不能发送
拼音选字状态按回车是「上屏」，不是「发送」。要拦两次：

```js
input.addEventListener("keydown", (e) => {
  const composing = e.isComposing || e.keyCode === 229;
  if (e.key !== "Enter" || e.shiftKey) return;
  if (composing) return;                       // 选字中：放行
  if (Date.now() - lastCompositionEnd < 500) return; // 选字结束 500ms 内也拦
  e.preventDefault();
  send();
});
input.addEventListener("compositionend", () => { lastCompositionEnd = Date.now(); });
```

### 2.2 自动跟随滚动：40px 跟随 / 滚动即停 / 120px 显示「跳至最新」
- 距底部 ≤ 40px：新消息自动跟随
- 用户一旦上滚：立刻停止跟随（不要抢回滚动位置）
- 距底部 > 120px：右下角出现「跳至最新」按钮，点击平滑回底

### 2.3 边框只套一层
容器已经有边框时，里面的按钮/输入框不再加边框：

```css
.card { border:1px solid var(--hairline); }
.card .btn { border:none; }
.card .btn:hover { background: var(--glass-card-hover); }
/* 需要描边感时用 inset 阴影，避免 border 变化导致的 1px 抖动 */
.btn.is-outlined { box-shadow: inset 0 0 0 1px var(--hairline-strong); }
```

### 2.4 同心圆角：外圆角 = 内圆角 + 内边距
否则内外弧线不平行，近距离看很脏。

```css
.card{ padding:12px; border-radius:20px; }
.card .inner{ border-radius:8px; }  /* 20 - 12 = 8 */
```

### 2.5 分栏拖拽：遮罩 + Esc 还原 + 双击 50/50 + 82% 自动收起
- 拖拽过程中给右侧预览盖一层透明遮罩（防止 iframe/视频抢走鼠标事件）
- `Esc` 恢复拖动前的比例
- 双击分隔条回到 50/50
- 左栏宽度 > 82% 时自动折叠右栏

### 2.6 长文件名中间省略，后缀必须完整
`text-overflow: ellipsis` 只会在尾部截断，把 `.psd` 也吃掉。用 RTL 技巧或 JS 中截：

```html
<span class="fn" dir="rtl"><bdo dir="ltr">2026-11-02-品牌视觉-终稿-不要再用-v3.psd</bdo></span>
```
```css
.fn{ display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
```

---

## 3. Select 与 Dropdown 的界线（Arco 判据）

> 原话：**Select 用于选择，Dropdown 是命令集合。**

| | 下拉菜单 Dropdown | 选择器 Select |
|---|---|---|
| 归属 | 导航与操作 | 数据录入 |
| 行为 | 点完立即执行命令或跳转 | 选中后回显，等待表单提交 |
| 形态 | 触发器可无边框 | **必须有外边框录入框** |
| 例子 | 导航栏菜单、表格行「更多操作」 | 表单里的城市、状态、负责人 |

**三条铁律**

1. **只有 2 个选项，禁用下拉**：用单选（Radio）或开关（Switch），省一次点击。
2. **少于 5 个选项，直接平铺**在主界面，减少操作步长。
3. **超过 10 个选项，必须限高 + 搜索**：下拉高度建议 ≤ 264px（约 8 行），配搜索框；生日、地址这类「熟悉数据」直接输入比滚动选择快。

---

## 4. 本项目的既有案例（同样属于「规则」）

这些都是踩过的坑，写进手册避免重复：

| 现象 | 根因 | 规则化结论 |
|---|---|---|
| 进度条完全消失 | `.np-progress` 用 `margin:0 auto`，flex 容器按内容收缩，内部 `flex:1` 得 0 宽 | **flex 容器要撑满时不要用 `margin:auto` 居中**，用 `width:100%` + `margin-inline:auto` |
| 设置页说明变成竖排 | `.set-ctrl` 是 `flex-shrink:0`，一排 chip 按 max-content 撑开，把 `.set-info` 压到一个字宽 | **带整排 chip 的 `set-row` 一律 `flex-wrap` 并让 info `flex:1 1 100%`** |
| 弹窗「知道了」点不动 | `UI.modal` 的 ok 按钮只在传 `onOk` 时才绑事件 | **任何 modal 的 ok 必须显式传回调**，否则按钮是死的 |
| 逐字歌词整行闪 | 判定写成 `t>=s && t<e`，字唱完就熄灭 | **进度类状态只判「已到达」，不判「未超出」** |
| 长列表导入丢一半 | 注册表硬上限 500，超出从头删 | **限流按配额，不按条数**；写盘批量化 |

---

## 5. 提交前自查（8 条，30 秒过一遍）

1. 弹层组件 **选对了吗**？（对着 §0 表念一遍场景）
2. 深色下层与层之间，**有没有靠 1–3% 明度差**区分，而不是加黑边框？
3. 输入框聚焦时，**有没有 1px 位移**？
4. 所有数字（时间、价格、计数）**开了 tabular-nums** 吗？
5. 折叠/展开动画是 **0fr→1fr** 还是 height 硬动？
6. 内层圆角 **等于外层圆角减内边距** 吗？
7. 一层里有没有 **两层边框**？
8. 用户中途滚动时，界面 **会不会抢回滚动位置**？

---

*本文件是「记忆」：每次改界面前读一遍，比凭感觉调参快。*
