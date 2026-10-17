# 同步适配源

同步内核只负责计划、校验、事务执行、撤销和重做；具体游戏目录结构由 JSON 适配源描述。

内置的 `jx3.json` 覆盖正式服、测试服、角色目录、剑心插件和茗伊插件。运行时还会读取应用数据目录下的 `sync-sources/*.json`。外部适配源使用相同 `id` 时覆盖内置版本，因此路径调整和文件增删不需要修改 Rust 同步内核。

## 主要字段

- `variants.*.dataRoots`：从用户选择的安装目录定位实际数据根目录。
- `rootMarkers`：用于确认候选数据根目录有效。
- `roleCatalog`：账号、大区、服务器、角色的目录层级。
- `roleId`：需要特殊角色 ID 解析时调用的 Hook 及其搜索路径。
- `roleMetadata`：从插件数据提取角色门派等元数据；映射和路径都由适配源配置。
- `groups`：界面展示的同步分组。
- `files[].sourceCandidates`：按顺序尝试的来源路径，可处理目录大小写或版本差异。
- `files[].target`：目标路径模板。
- `files[].mode`：`file` 或复制目录内普通文件的 `directory`。
- `files[].inlineBase64`：由规则包提供固定二进制内容。

路径模板支持 `{account}`、`{area}`、`{server}`、`{role}`、`{roleId}`，以及变体 `variables` 定义的变量，例如 `{locale}`。

适配源中的所有路径都必须是数据根目录内的相对路径。同步内核拒绝绝对路径和 `..`，并且在执行前将目标的 before 快照和来源的 after 快照一起写入持久化事务目录。
