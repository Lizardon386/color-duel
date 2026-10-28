# color-duel（变色对决）· 上下文与进展

> 交接卡：当前状态、下一步、坑与验证命令。
> 最近更新：2026-10-28　模式：三档（README / DESIGN / CONTEXT）

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

- **代码完成，平台联调待做。** 规则层、状态机、机器人、客户端、规则资料与 rule-config 声明都已实现。
- `npm test` 31/31；`npm run build` 生成 `dist/color-duel.bpmap`（约 100KB）；`bpmap doctor dist-pack` 通过。
- SDK 契约已由平台仓库的 SDK 会话落地并推送：`950083c`，四包版本 0.3.0（**尚未发布 npm**）；本仓库当前通过本地 link 使用 0.3.0。
- 平台侧（对局区全宽、建房规则表单、规则资料抽屉）由另一个会话在 `D:\agent_workspace\3178-battle-platform` 实现中。
- 公开仓库尚未创建/推送；`uno-online` 未改动。

## 4. 下一步

1. **等平台会话完成后跑真机联调**：装包 → 建房（勾规则）→ 加 3 个电脑 → 打完一局 → 房主 rematch；1280×800 与 600×400 各看一次。
2. **发布 SDK 0.3.0**：`sdk-v0.3.0` tag → Actions 发布；然后把 `package.json` 的 SDK 依赖改为 `^0.3.0`，重新生成 lock，跑 CI 等价命令。
3. **创建公开仓库并推首个提交**：`gh repo create Lizardon386/color-duel --public`，CI 绿后打 `v0.1.0` tag。
4. 可选：把 8 人满桌、观战视角、质疑失败三类局面补进预览截图。

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

## 6. 验证命令

```bash
npm test                 # 31 例
npm run build            # dist-pack/ + dist/color-duel.bpmap
npm run doctor           # bpmap doctor dist-pack
```

装进平台：

```bash
node scripts/build.mjs --platform ../3178-battle-platform
node ../3178-battle-platform/packages/hostd/dist/cli.js host --port 3178 --lan-port 3000
```

代码健康门槛：`npm test`、`npm run build`、`npx bpmap doctor dist-pack`。平台仓库改动另跑 `npm test` / `npm run seam` / `npx tsc -b`。

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

- 2026-10-28 Qoder：**重构落地**。从 `uno-online` 移植规则、状态机、AI、界面与规则文案；新增 rule-config 与 reference 声明；31 例测试、构建与 doctor 通过；平台联调与公开发布待做。
