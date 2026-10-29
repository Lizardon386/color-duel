# color-duel（变色对决）· 上下文与进展

> 交接卡：当前状态、下一步、坑与验证命令。
> 最近更新：2026-10-28　模式：三档（README / DESIGN / CONTEXT）　锚点：`8c68c06`（main，无远端；本次交接提交在其后）

## 1. 文档目录

| 文档 | 阅读对象 | 内容 |
|---|---|---|
| [README.md](README.md) | 玩家 / 开发者 | 游戏介绍、规则摘要、安装与开发、配置项、限制 |
| [DESIGN.md](DESIGN.md) | 开发者 / 评审 | 目标与约束、架构、状态机、计时与机器人、平台接缝、设计决策 |
| [CONTEXT.md](CONTEXT.md)（本文） | 维护者 / 交接 agent | 当前状态、下一步、坑与验证命令、交接记录 |

## 2. 目标与完成定义

把「变色对决」完整重构为 3178 平台的游戏包：2~8 人、观战、三档电脑、五个规则开关 + 手牌上限、报牌/质疑/碰/甩色/0/7、规则资料与规则表单。

完成定义：`npm test` 全绿；`npm run build` + `bpmap doctor` 通过；装进平台后 1 真人 + 3 电脑能打完一局并再来一局；公开仓库 `Lizardon386/color-duel` 可被外部开发者按 README 构建。

## 3. 现在在哪

- **代码与平台联调完成。** 规则层、状态机、机器人、客户端、规则资料与 rule-config 声明已实现并验证。
- `npm test` 33/33；`npm run build` 生成 `dist/color-duel.bpmap`（102,353 字节，SHA256 `b85db75129c4adbb807c631854aa6cb129d02239fedfb41125b6a05bc70916c8`）；`bpmap doctor dist-pack` 与 `--host` 通过（含 reference 文档校验）。
- SDK 0.3.0 用本地 link：四包 0.3.0，`game-sdk` 解析到平台 `packages/game-sdk`；`package.json` / lock 仍写 `^0.2.0`，未提交 link 状态。0.3.0 **尚未发 npm**。
- 平台侧（3178 仓库，216/216）：房间内「本局规则」卡（`ruleConfig` 命令，仅房主、仅 lobby）、资料懒加载、单入口壳；平台交接卡在 `130c568`。
- **联调 PASS**：协议级（房间 4NTW）改规则后 `rulesHash` 变化、ready 重置、广播、中途 `seatResume`、rematch 7/7；UI（ZYT7）房主编辑/玩家只读、规则同步、开局、资料、刷新坐回；重启恢复（FFZ9）config/hash/手牌恢复后继续出牌。初版包在平台 `games/color-duel.bpmap` 留了一份给用户自测。
- 游戏 smoke：2/4/8 席 × 多 seed 共 40 局，20 对同 seed 的动作轨迹与最终状态一致、0 被拒；牌 ID 因模块级 `deckSeq/refillSeq` 跨运行不同。
- 公开仓库尚未创建/推送；`uno-online` 未改动。

## 4. 下一步

1. **等用户自测初版包**：`dist/color-duel.bpmap`（平台 `games/` 也有一份）；建房/改规则/开局，反馈先修问题。
2. **发布 SDK 0.3.0（需用户确认）**：`sdk-v0.3.0` tag → Actions 发布；然后把本仓库依赖改 `^0.3.0`、重生成 lock，跑测试/构建。
3. **创建公开仓库并推首个提交**：`gh repo create Lizardon386/color-duel --public`，CI 绿后打 `v0.1.0` tag。
4. 可选：按局重置 `deckSeq/refillSeq` 让牌 ID 跨运行可复现；补 8 人/观战/质疑预览截图。

## 5. 关键约束与易踩的坑

- **`noTurnTimer` 的对外 key 是 `no-turn-timer`**：rule-config 的 key 只允许小写连字符，`normalizeConfig` 负责翻译；不要再把 camelCase 写进表单。
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
- **本地 link 不是提交状态**：`package.json` / lock 仍是 `^0.2.0`；跑 `npm install` 会换回 0.2.0，需重跑 link（或用 `--no-save` 的 0.3.0 tarball）；不要把 link 结果提交。
- **牌 ID 跨运行不复现**：`rules.ts` 的 `deckSeq/refillSeq` 是模块级计数器；动作轨迹可复现，cardId 不能跨进程回放。若要按 ID 回放，按局重置计数器。
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
| 模块声明（ruleConfig / reference） | [index.ts](src/server/index.ts) |
| 客户端界面 | [client/index.ts](src/client/index.ts) / [styles.css](src/client/styles.css) |
| 弹窗 | [dialogs.ts](src/client/dialogs.ts) |
| 规则资料 | [reference.json](src/reference.json) |
| 构建与打包 | [scripts/build.mjs](scripts/build.mjs) |

## 8. 交接记录

- 2026-10-28 Qoder：**联调收工**：SDK 0.3.0 link；协议 4NTW / UI ZYT7 / 重启 FFZ9 全 PASS；33/33、smoke 40 局动作可复现（牌 ID 例外）；初版包 `dist/color-duel.bpmap`（SHA `b85db751…`），平台 `games/` 留了一份给用户自测；SDK 发布与公开仓库仍待用户确认。
- 2026-10-28 Qoder：**交接**：交给会话 `835cf812`；代码与文档已就绪（33/33），剩余真机联调、SDK 0.3.0 发布（待用户确认）、公开仓库与 CI。
- 2026-10-28 Qoder：**重构落地**。从 `uno-online` 移植规则、状态机、AI、界面与规则文案；新增 rule-config 与 reference 声明；33 例测试、构建与 doctor 通过；平台联调与公开发布待做。
