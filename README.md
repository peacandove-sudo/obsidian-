# 个人工作台

WJQ 的私有 Obsidian 任务管理插件。

## 使用 BRAT 自动更新

本仓库用于 BRAT 更新。每次发布新版本时，GitHub Release 需要包含：

- `main.js`
- `manifest.json`
- `styles.css`

任务数据继续存放在各设备 Vault 内的 `.obsidian/plugins/wjq-task-hub/data.json`，不会提交到本仓库。