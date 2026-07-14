# Roadmap

当前基线：大厅 + Chess v0.2.3（可玩）+ Mahjong v0.2.2（换三张/定缺/基础摸打）。

## Near term

### Chess

1. 完整合法走子（将军过滤、王车易位、吃过路兵、升变选择）
2. 将军 / 将死 / 和棋判定
3. 持久化整局棋谱与恢复
4. AI：更深搜索 + 开局库（仍放在 `js/ai.js`）

### Mahjong

1. 碰 / 杠 / 胡 交互入口
2. 补全 `hu.js`（标准胡、七对等）
3. 补全 `score.js`（血战番型、不封顶）
4. 将 `game.js` 内联 AI 迁入 `ai.js`（打缺门 → 搭子 / 向听）
5. 血流 / 一炮多响等规则开关（仍走 `config.js`）

## Mid term

- 统一设置与音效偏好（可落在 `shared/`）
- 移动端触控与横竖屏体验细化
- 可选 ES modules + 简单构建（仍保持 Pages 可部署）

## Out of scope for framework pass

- 重写画面
- 更换技术栈
- 删除 `legacy/`（保留作备份直到确认稳定）
