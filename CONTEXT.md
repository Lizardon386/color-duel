# color-duel（变色对决）· 上下文与进展

> 交接卡：当前状态、下一步、坑与验证命令。
> 最近更新：2026-10-30　模式：三档（README / DESIGN / CONTEXT）　锚点：`dad7053`（main，已推 origin；v0.2.2 已发布）

## 1. 文档目录

| 文档 | 阅读对象 | 内容 |
|---|---|---|
| [README.md](README.md) | 玩家 / 开发者 | 游戏介绍、运行平台与依赖、快速开始、规则摘要、配置项、限制 |
| [DESIGN.md](DESIGN.md) | 开发者 / 评审 | 目标与约束、架构、状态机、计时与机器人、平台接缝、设计决策 |
| [CONTEXT.md](CONTEXT.md)（本文） | 维护者 / 交接 agent | 当前状态、下一步、坑与验证命令、交接记录 |
| [压卡备份.md](压卡备份.md) | 维护者 | 历次压卡搬出的日志块（逐字保留，供追溯） |

## 2. 目标与完成定义

把「变色对决」完整重构为 3178 平台的游戏包：2~8 人、观战、三档电脑、五个规则开关 + 手牌上限、报牌/质疑/碰/甩色/0/7、规则资料与规则表单。

完成定义：`npm test` 全绿；`npm run build` + `bpmap doctor` 通过；装进平台后 1 真人 + 3 电脑能打完一局并再来一局；公开仓库 `Lizardon386/color-duel` 可被外部开发者按 README 构建。

## 3. 现在在哪

- **代码与平台联调完成**：规则层/状态机/机器人/客户端/资料/rule-config 已实现验证；0.2.0 的座位级选项、SDK 0.4.0 与平台三栏联调明细见 [压卡备份.md](压卡备份.md) §1。
- `npm test` **37/37**；`npm run build` 生成 **0.2.2** 包 `dist/color-duel.bpmap`（127,814 字节，SHA256 `83b0a7b90f22182e4501bb508b486d4ed6a6e793e19baa7844515bab8c906777`）；`bpmap doctor` 通过；平台 `games/` 已换 0.2.2。
- **界面重做（0.2.1，并入 0.2.2 发布）**：对手上半环 + 圆形头像（座位色 + 7 种花纹，走 seatOptions.avatar）、自己在底部；出牌/摸牌飞牌动画、回合呼吸；生效色光晕、待罚徽标、手牌压缩 + 两字标签 + 扇形、操作条居中；修掉「11 张手牌撑破整桌」的网格缺陷。截图见 `docs/images/game-table.png`。
- **牌桌可读性增强（0.2.2，已发布 `v0.2.2`）**：UNO 式方向环（围着两个牌堆，4 个箭头顺/逆时针，反转牌落下时整环闪一下）、出牌气泡（谁出了什么直接飘在头像上方，数字牌报点数、功能牌报「+2 / 反转 / 换色 / 弃色」）、轮到自己时手牌区顶部亮一条金边。CDP 实测 480×360 / 600×360 / 1090×485 与 8 人局：方向环均完整落在桌面内不裁切，4 个箭头齐全，气泡能正确挂在出牌者席位上。
- **公开仓库与发布**：<https://github.com/Lizardon386/color-duel>（`main`，CI 绿）；tag `v0.2.2`（指向 `dc69623`）+ [Release](https://github.com/Lizardon386/color-duel/releases/tag/v0.2.2) 附 0.2.2 包（127,814 B，SHA256 `83b0a7b9…`）与 `SHA256SUMS`，CI 41038148682 绿；tag `v0.2.0`（指向 `cdd796f`）+ Release 附 0.2.0 包（104,268 B，SHA256 `72410de4…`）；v0.1.0 保留；0.2.1 未单独发布，改动并入 0.2.2。

## 4. 下一步

1. **用户自测 0.2.2**：平台 `games/` 已换新包（SHA `83b0a7b9…`），重启宿主后建房；重点看方向环的顺/逆序、别人出牌时飘出的气泡、轮到自己时手牌区金条，再看 8 席、10 张以上手牌、报牌倒计时、弃牌弹窗。
2. **format 2（压缩二进制包）**：用户说后面再说，不动代码；重启讨论时按之前的 `BPMAP2` 方案。
3. **可选打磨**：宽屏留白（席位环排布）、结算页战绩，都未立项。

## 5. 关键约束与易踩的坑

- **`noTurnTimer` 的对外 key 是 `no-turn-timer`**：rule-config 的 key 只允许小写连字符，`normalizeConfig` 负责翻译；不要再把 camelCase 写进表单。
- **座位选项只在 `normalizeSeatOptions` 收口**：`difficulty` 只给 ai、`color` 给 host/player/ai；AI 默认 easy，默认色按 slot 循环；非法值回落，不要在别处再补默认。全局难度已删，别写回 `ruleConfig`。
- **颜色从 serialize 读**：服务端 `players[].options` 带 color/difficulty，客户端座位框底色与描边据此着色；`bp:room.seats` 只作补充，不是唯一来源。
- **SDK 依赖已走 registry 0.4.0**：`package.json` / lock 已提交；升级时改版本并重生成 lock，不要再 `npm link`。
- **卡牌高度变量**：`--cd-ch` 必须在 `.cd-root` 上定义；放在 `:root` 会按默认 `--cd-cw` 提前求值，卡片变正方形且手牌被裁。局部改 `--cd-cw` 时要同时重算 `--cd-ch`（见 `.cd-reveal`），否则卡片被拉成竖条。
- **网格列宽**：`.cd-root` / `.cd-main` 必须写 `minmax(0, 1fr)`，行容器补 `min-width: 0`；否则手牌的 max-content 撑宽整桌，右侧按钮被裁、`overflow-x:auto` 失效。
- **`[hidden]` 需要显式 `display:none !important`**：否则被 `.cd-chip` 的 flex 覆盖，「待罚 +0」会一直显示。
- **不要用 `end` Effect 结束对局**：平台会把房间置为 ended 并踢回大厅，丢掉结算与 rematch；本游戏只改内部 `state='ended'`。
- **tick 必须返回非空 effect**：平台只在 effect 非空时 fanout；机器人动作要返回轻量 `broadcast`。
- **规则错误走 `toSeat` error**：`Reject` 会落在平台状态栏，不是游戏内提示。
- **质疑揭示只给提问者**：`serialize` 里只放 `heldCount` 与名单；手牌快照用一次性 `toSeat` 事件。
- **机器人不用 `setTimeout`**：用 `botDueAt` + `tick`；动作被拒时按超时兜底，避免死循环。
- **观战 `viewer` 为 `null`**：客户端靠 `view.viewer` 判断观战，不能只看 `actions.seatId()`。
- **单文件客户端**：构建后 `dist-pack/client/client.js` 不能有 `import`；CSS 走 esbuild `text` loader 内联。
- **包清单与模块的 reference 必须一致**：宿主加载器会拒绝两者不一致的包；`scripts/build.mjs` 已从 `reference.json` 存在与否自动写包头，不要手改。
- **reference 要写进 bpmap.json**：`bpmap doctor` 从清单读 `reference.entry`，只看 `GameModule.reference` 不会校验资料文档。
- **带标签的卡不再画右下角值**：`cd-tag` 和右下角数字会叠在一起，`createCard` 已二选一。
- **出牌气泡随席位重建被清**：气泡挂在席位节点上，`renderSeats` 每帧 `replaceChildren` 会顺带清掉上一帧的气泡——这是刻意的「新帧刷新」，不是 bug；若要它稳定存活满 1.1s，得改挂到 root 层并自己算坐标。
- **牌 ID 跨运行不复现**：`rules.ts` 的 `deckSeq/refillSeq` 是模块级计数器；动作轨迹可复现，cardId 不能跨进程回放。按当前决定保持原样，不按局重置。
- **`ruleConfig` 是平台命令**：游戏不订阅消息；平台改规则后重新 `normalizeConfig`，开局/恢复时只通过 `create` / `resume` 的 config 进入游戏。
- **快照契约**：`snapshot.version = 1`，`acceptsSnapshot` 只认 1；`resume` 用 `ctx.config` 重建，别把 config 写死在快照里。
- **重启恢复测试要先激活房主能力**：单入口壳只有 `POST /api/host/ready` 才开 HostStore/落盘，纯 WS 建房不落盘。
- **平台仓库有别人未提交的改动**：`3178-battle-platform` 当时 HEAD `95c72b6`，另有 7 个未提交改动（`.gitignore` / `DESIGN` / `README` / `client` 三件 / style-hooks 测试），不是本任务产生，别顺手提交、回滚或格式化。

## 6. 验证命令

```bash
npm test                 # 37 例（已含 tsc 类型检查）
npm run build            # dist-pack/ + dist/color-duel.bpmap
npx bpmap doctor dist-pack --host http://127.0.0.1:3178
```

装进平台：把 `dist/color-duel.bpmap` 拷到 `games/`，起 `3178对战平台.bat`（或 `node packages/hostd/dist/cli.js shell --port 3178 --lan-port 3000`）。

代码健康门槛：`npm test`、`npm run build`、`npx bpmap doctor dist-pack`。平台仓库改动另跑 `npm test`（216）/ `npm run seam` / `npx tsc -b`。发版用 `gh release create vX.Y.Z`（gh 已认证 Lizardon386），附 `dist/color-duel.bpmap` + `color-duel-vX.Y.Z-SHA256SUMS`；UI 验证脚手架在 `.workbuddy-ai/tmp/`（gitignored，含 `cdp-verify.mjs` / `shot.mjs`，重装即丢）。

## 7. 关键入口

| 关注点 | 位置 |
|---|---|
| 牌堆与合法性 | [rules.ts](src/server/rules.ts) |
| 状态机 / 计时 / 机器人调度 | [game.ts](src/server/game.ts) |
| 三档机器人决策 | [bots.ts](src/server/bots.ts) |
| 房规归一化 | [config.ts](src/server/config.ts) |
| 模块声明（ruleConfig / reference / seatOptions） | [index.ts](src/server/index.ts) |
| 座位选项声明与归一 | [seat-options.ts](src/server/seat-options.ts) |
| 客户端界面 | [client/index.ts](src/client/index.ts) / [styles.css](src/client/styles.css) |
| 弹窗 | [dialogs.ts](src/client/dialogs.ts) |
| 规则资料 | [reference.json](src/reference.json) |
| 构建与打包 | [scripts/build.mjs](scripts/build.mjs) |

## 8. 交接记录

- 2026-10-30 WorkBuddy：**收工**：v0.2.2 已发布（tag `v0.2.2` → `dc69623`，Release + CI 41038148682 绿）；压卡把 0.2.0 联调/SDK 明细搬到 `压卡备份.md`，CONTEXT 104 → 98 行；锚点更新为 `dad7053`；下一家按「接盘」读卡，先跑 `npm test` + `npm run build` + `npx bpmap doctor`，再做用户自测（方向环/气泡/金条）。
- 2026-10-30 WorkBuddy：**0.2.2 发布**：tag `v0.2.2`（指向 `dc69623`）+ GitHub Release，附 `color-duel.bpmap`（127,814 B，SHA256 `83b0a7b9…`）与 `color-duel-v0.2.2-SHA256SUMS`；CI 41038148682 绿；0.2.1 未单独发布，其改动并入本版 Release 说明；CONTEXT 的状态与下一步已同步为「已发布」。
- 2026-10-30 WorkBuddy：**牌桌可读性增强（0.2.2）**：UNO 式方向环（围着两个牌堆的 4 个箭头，顺/逆时针靠整环 `scaleX(-1)` 镜像，反转牌落下时闪一下）、出牌气泡（谁出了什么直接飘在头像上方：数字牌报点数、功能牌报「+2 / 反转 / 换色 / 弃色」）、轮到自己时手牌区顶部亮金条。`detect` 只记录 `bubble` / `dirFlip`，`playFlights` 负责消费；37/37、tsc、构建、doctor 通过；CDP 在 480×360 / 600×360 / 1090×485 与 8 人局实测，环均不出桌、箭头 4 个、气泡能挂到出牌者席位；包 `83b0a7b9`（127,287B），平台 `games/` 已换。
- 2026-10-30 WorkBuddy：**UI 重做（0.2.1）**：先做 UI 评审（600×360 实测 11 张手牌即撑破整桌、右侧按钮被裁；弃牌池把牌切半），再按斗地主/三国杀牌桌习惯重排：圆形头像（座位色 + 7 种花纹，seatOptions.avatar）+ 上半环、自己固定底部、出牌/摸牌飞牌、回合呼吸、生效色光晕、待罚徽标、手牌压缩 + 两字标签 + 扇形、操作条居中；37/37、构建、doctor 通过；包 `33f2befd`（121,628B）。
- 2026-10-30 Qoder：**交接**：0.2.0 已发布（tag/Release，包 72410de4）；平台 a634d57 三栏布局下改色/难度/转交/解散、232/232、协议 717/UI 909 猴测均通过；下一家按「接盘」读卡，UI 布局/format 2 待拍板。
- 2026-10-30 Qoder：**0.2.0 发布**：版本 0.2.0；seatOptions 座位颜色/逐座难度；SDK 0.4.0 registry；README/DESIGN 同步；37/37；平台 a634d57 三栏布局下改色/难度/转交/解散通过；协议 717、UI 909 猴测 0 违规；包 72410de4（104,268B）；main `cdd796f` 已推，tag `v0.2.0` + Release 已建，CI 41023620800 绿。
- 2026-10-29 Qoder：**v0.1.0 发布**：tag `v0.1.0`（指向 `e61d256`）+ GitHub Release，附 `color-duel.bpmap`（SHA256 `b85db751…`）；CI 绿。
- 2026-10-29 Qoder：**公开仓库与 README**：创建 `Lizardon386/color-duel` 并推 `main`（`65c0dcf`），CI run 40842602844 绿；README 统一标题、去掉 No Mercy、新增「运行平台与依赖」小节（`efccf78`，CI 40842888001 绿）；用户暂不自测，`v0.1.0` tag 待定。
- 2026-10-29 Qoder：**SDK 0.3.0 正式依赖**：四包已发 npm（latest，tag `sdk-v0.3.0` + Release）；`game-sdk` / `sdk-tools` 切 `^0.3.0`，lock 指向 registry；`npm test` 33/33、构建、doctor（含 `--host`）通过；包哈希不变 `b85db751…`；提交 `1a78b9e`。
- 2026-10-28 Qoder：**联调收工**：SDK 0.3.0 link；协议 4NTW / UI ZYT7 / 重启 FFZ9 全 PASS；33/33、smoke 40 局动作可复现（牌 ID 例外）；初版包 `dist/color-duel.bpmap`（SHA `b85db751…`），平台 `games/` 留了一份给用户自测；SDK 发布与公开仓库仍待用户确认。
