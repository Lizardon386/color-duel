# color-duel（变色对决）· 上下文与进展

> 交接卡：当前状态、下一步、坑与验证命令。
> 最近更新：2026-10-30　模式：三档（README / DESIGN / CONTEXT）　锚点：`64e5200`（main，未推送；本次交接提交在其后）

## 1. 文档目录

| 文档 | 阅读对象 | 内容 |
|---|---|---|
| [README.md](README.md) | 玩家 / 开发者 | 游戏介绍、运行平台与依赖、快速开始、规则摘要、配置项、限制 |
| [DESIGN.md](DESIGN.md) | 开发者 / 评审 | 目标与约束、架构、状态机、计时与机器人、平台接缝、设计决策 |
| [CONTEXT.md](CONTEXT.md)（本文） | 维护者 / 交接 agent | 当前状态、下一步、坑与验证命令、交接记录 |

## 2. 目标与完成定义

把「变色对决」完整重构为 3178 平台的游戏包：2~8 人、观战、三档电脑、五个规则开关 + 手牌上限、报牌/质疑/碰/甩色/0/7、规则资料与规则表单。

完成定义：`npm test` 全绿；`npm run build` + `bpmap doctor` 通过；装进平台后 1 真人 + 3 电脑能打完一局并再来一局；公开仓库 `Lizardon386/color-duel` 可被外部开发者按 README 构建。

## 3. 现在在哪

- **代码与平台联调完成。** 规则层、状态机、机器人、客户端、规则资料与 rule-config 声明已实现并验证。
- `npm test` **37/37**；`npm run build` 生成 `dist/color-duel.bpmap`（103,741 字节，SHA256 `c6836db7b333106a70212511d7a9aa07998e2c398d75a4ae6099a09fea731569`，本地新包）；`bpmap doctor dist-pack` 通过。平台 `games/` 已还原为 v0.1.0 旧包（`b85db751…`）。
- **座位级选项已接**（SDK 0.4.0 本地 link）：`seatOptions` 声明 `difficulty`（仅 ai，easy/normal/cold，默认 easy）与 `color`（host/player/ai；#ef4444 / #f59e0b / #22c55e / #3b82f6）；`normalizeSeatOptions` 先按角色给默认（AI easy、颜色按 slot 轮转）再用合法的 raw 覆盖；AI 逐座读 `options.difficulty`，服务端 serialize 带每座 `options`，客户端座位条用座位框颜色表示（不再画色点）；全局 `ruleConfig.difficulty` 已删除。最终联调：平台 `75aef4a` + 本包 `c6836db7`，真实建房设色/难度/开局通过；协议猴测 seed 717（8 用户×300 步×3 重启，强制 color-duel）0 违规；UI 猴测 seed 909（4×60）0 违规。
- SDK 0.3.0 **已发 npm**（四包 `latest` 均 0.3.0；tag `sdk-v0.3.0` + GitHub Release 已建）；本仓库 `@lizardon386/game-sdk` / `sdk-tools` 仍是 `^0.3.0`，lock 指向 registry，提交 `1a78b9e`。座位选项需要 SDK 0.4.0（平台 `c326314`），当前只在本机 link，未改 package.json/lock。
- 平台侧（3178 仓库，232/232）：房间内「本局规则」卡、资料懒加载、单入口壳、席位行号码牌选色/电脑难度下拉；平台交接卡在 `75aef4a`。
- **联调 PASS**：协议级（房间 4NTW）改规则后 `rulesHash` 变化、ready 重置、广播、中途 `seatResume`、rematch 7/7；UI（ZYT7）房主编辑/玩家只读、规则同步、开局、资料、刷新坐回；重启恢复（FFZ9）config/hash/手牌恢复后继续出牌。初版包在平台 `games/color-duel.bpmap` 留了一份。
- 游戏 smoke：2/4/8 席 × 多 seed 共 40 局，20 对同 seed 的动作轨迹与最终状态一致、0 被拒；牌 ID 因模块级 `deckSeq/refillSeq` 跨运行不同。
- **公开仓库已创建并推送**：<https://github.com/Lizardon386/color-duel>（`main`，CI 绿）；README 已统一标题、去掉商业变体名、新增「运行平台与依赖」小节（提交 `efccf78`）；`uno-online` 未改动。
- **v0.1.0 已发布**：tag `v0.1.0`（指向 `e61d256`）+ GitHub Release，附 `color-duel.bpmap`（102,353 字节，SHA256 `b85db75129c4adbb807c631854aa6cb129d02239fedfb41125b6a05bc70916c8`）。

## 4. 下一步

1. **用户自测（暂缓）**：v0.1.0 包在平台 `games/`；新的座位选项包只在本机 `dist/`，未发布。
2. **平台席位行改造（已完成）**：平台 `501ecd4` / `75aef4a`；号码牌选色、无设置按钮、电脑内联难度下拉；最终 UI + 协议/UI 猴测均 0 违规。
3. **SDK 0.4.0 发布后**：把依赖切 `^0.4.0`、重生成 lock，再考虑发 `0.2.0`；README 的规则配置表还在描述旧的全局难度，随发布一起改。本轮未推公开仓库。
4. **UI 布局**：Hallmark audit 已出（3 critical / 4 major / 3 minor），A 布局重构或 B 最小修正待用户拍板；未动代码。
5. **format 2（压缩二进制包）**：用户说后面再说，不动代码；重启讨论时按之前的 `BPMAP2` 方案。

牌 ID 跨运行不复现保持现状（`deckSeq/refillSeq` 不改）。

## 5. 关键约束与易踩的坑

- **`noTurnTimer` 的对外 key 是 `no-turn-timer`**：rule-config 的 key 只允许小写连字符，`normalizeConfig` 负责翻译；不要再把 camelCase 写进表单。
- **座位选项只在 `normalizeSeatOptions` 收口**：`difficulty` 只给 ai、`color` 给 host/player/ai；AI 默认 easy，默认色按 slot 循环；非法值回落，不要在别处再补默认。全局难度已删，别写回 `ruleConfig`。
- **颜色从 serialize 读**：服务端 `players[].options` 带 color/difficulty，客户端座位条据此画点；`bp:room.seats` 只作补充，不是唯一来源。
- **SDK 0.4.0 是本地 link**：`package.json` / lock 仍 `^0.3.0`；不要跑 `npm install`（会回 0.3.0），等 0.4.0 发 npm 后再切依赖。
- **卡牌高度变量**：`--cd-ch` 必须在 `.cd-root` 上定义；放在 `:root` 会按默认 `--cd-cw` 提前求值，卡片变正方形且手牌被裁。
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
- **牌 ID 跨运行不复现**：`rules.ts` 的 `deckSeq/refillSeq` 是模块级计数器；动作轨迹可复现，cardId 不能跨进程回放。按当前决定保持原样，不按局重置。
- **`ruleConfig` 是平台命令**：游戏不订阅消息；平台改规则后重新 `normalizeConfig`，开局/恢复时只通过 `create` / `resume` 的 config 进入游戏。
- **快照契约**：`snapshot.version = 1`，`acceptsSnapshot` 只认 1；`resume` 用 `ctx.config` 重建，别把 config 写死在快照里。
- **重启恢复测试要先激活房主能力**：单入口壳只有 `POST /api/host/ready` 才开 HostStore/落盘，纯 WS 建房不落盘。

## 6. 验证命令

```bash
npm test                 # 33 例
npm run build            # dist-pack/ + dist/color-duel.bpmap
npx bpmap doctor dist-pack --host http://127.0.0.1:3178
```

装进平台：把 `dist/color-duel.bpmap` 拷到 `games/`，起 `3178对战平台.bat`（或 `node packages/hostd/dist/cli.js shell --port 3178 --lan-port 3000`）。

代码健康门槛：`npm test`、`npm run build`、`npx bpmap doctor dist-pack`。平台仓库改动另跑 `npm test`（216）/ `npm run seam` / `npx tsc -b`。

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

- 2026-10-30 Qoder：**座位级选项收工**：`difficulty`（仅 ai，默认 easy）+ `color`（host/player/ai；#ef4444/#f59e0b/#22c55e/#3b82f6）；AI 逐座难度；serialize 带 options，客户端用座位框着色（无点）；全局 `config.difficulty` 删除；37/37；平台 UI `75aef4a`（号码牌选色/无设置按钮/内联难度）；真实包 c6836db7（103,741B）最终 UI 通过；协议猴测 717、UI 猴测 909 均 0 违规；游戏提交 `64e5200`，未发布/未推送。
- 2026-10-29 Qoder：**v0.1.0 发布**：tag `v0.1.0`（指向 `e61d256`）+ GitHub Release，附 `color-duel.bpmap`（SHA256 `b85db751…`）；CI 绿。
- 2026-10-29 Qoder：**公开仓库与 README**：创建 `Lizardon386/color-duel` 并推 `main`（`65c0dcf`），CI run 40842602844 绿；README 统一标题、去掉 No Mercy、新增「运行平台与依赖」小节（`efccf78`，CI 40842888001 绿）；用户暂不自测，`v0.1.0` tag 待定。
- 2026-10-29 Qoder：**SDK 0.3.0 正式依赖**：四包已发 npm（latest，tag `sdk-v0.3.0` + Release）；`game-sdk` / `sdk-tools` 切 `^0.3.0`，lock 指向 registry；`npm test` 33/33、构建、doctor（含 `--host`）通过；包哈希不变 `b85db751…`；提交 `1a78b9e`。
- 2026-10-28 Qoder：**联调收工**：SDK 0.3.0 link；协议 4NTW / UI ZYT7 / 重启 FFZ9 全 PASS；33/33、smoke 40 局动作可复现（牌 ID 例外）；初版包 `dist/color-duel.bpmap`（SHA `b85db751…`），平台 `games/` 留了一份给用户自测；SDK 发布与公开仓库仍待用户确认。
- 2026-10-28 Qoder：**交接**：交给会话 `835cf812`；代码与文档已就绪（33/33），剩余真机联调、SDK 0.3.0 发布（待用户确认）、公开仓库与 CI。
- 2026-10-28 Qoder：**重构落地**。从 `uno-online` 移植规则、状态机、AI、界面与规则文案；新增 rule-config 与 reference 声明；33 例测试、构建与 doctor 通过；平台联调与公开发布待做。
