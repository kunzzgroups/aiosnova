# 本地多公司测试配置

日期：2026-10-29。用户授权：本地 aiosnova_ai_local，只复用各公司已有连接，不跨公司复制 Key。

## 本次操作

通过 8081 管理 API 写入。操作前 health UP，检查运行中的 8081 进程数据库连接为 127.0.0.1:3307；未访问团队服务器，未读出或复制 API Key，未调用模型、验证连接或同步模型。

- 新增 10 个 active Agent：每家公司各一个 `[AI456 Test] <公司> Calculator`、一个 `[AI456 Test] <公司> No Tools`。
- J1 复用原 Calculator，并追加新 Calculator Agent 的授权；原 HR Agent 授权保留。
- J2、RETAIL、WHOLESALE、TOKYO-I 各新增一个 Calculator：Utility / calc.run / calculator / active / low / 30 秒 / 无确认 / configuration={}。
- 每个 No Tools Agent 保持无工具授权；所有新 Agent 均无知识库绑定。
- J1 两个新 Agent 都固定绑定现有 OpenRouter 的模型配置 3406c141-3514-4bc4-89ef-3fb1b3b136b9，modelId=deepseek/deepseek-v4.1-flash-1017；本次只使用已有启用和能力记录，未重新调用 Provider 验证实时可用性。
- 其他四家公司现有 Provider 列表为空，故 Agent 使用 Auto，尚不能进行真实模型聊天。未创建假 Provider、假 Key 或无能力数据的假模型。

所有新配置 ID 见同目录 `AI-04-05-06-local-test-data-2026-10-29.json`。此 JSON 不含 Key/token，是操作清单，不是完整备份或恢复脚本。

## 已回查

- 五家公司新 Agent 及 Calculator 绑定重新 GET 后存在，Merchant 为 merchant-acme。
- No Tools Agent 均无工具绑定。
- 原 HR Agent 的 Calculator 授权保留。
- J2 GET J1 的 Calculator 详情、新 Agent 详情均为 404。

初次盘点时 PowerShell 非终止错误导致旧 Tools 变量在输出中被重复展示；已通过遇错停止、独立回查纠正，非接口泄漏。初次四个空公司的实际 Tools 请求均为 403。

## 发现的现有限制（本次未改业务代码）

1. AiToolRepository.companyExistsInMerchant 用 ai_agents 行判断公司所属 Merchant；公司尚无 Agent 时，Tools 列表会返回「Company is outside this Merchant scope」。创建首个 Agent 后本次四个公司列表正常。后续应在接 Core 时改用可信公司来源，不能把有无 Agent 当作最终公司身份。
2. MSW toolChatPreviewHandlers 的 companyId/agentId 白名单固定为 company-j1 和原 HR Agent。新 Agent 在 MSW 预览里返回 403 不代表数据库授权错误；MSW 不读取 MySQL 工具绑定。
3. 正常前端尚未启用正式工具聊天，8081 缺少正式 Session 装配；当前新增配置不等于新 Agent 已能从正常页面执行 Calculator。
4. 只有 J1 有 Provider/模型。按用户选择未把 J1 Key 复制给其他公司。为其他公司补有效 Provider 需要各公司自行配置凭证，或用户另行明确授权共享测试凭证。

## 页面测试顺序

1. 先测管理页面，不发送聊天：依次切换五家公司，AI Agents 搜索 `[AI456 Test]`，每家公司应有两个新 Agent。
2. 查看 J1 两个 Agent 的固定模型；其他公司为 Auto。刷新后检查一致。
3. 打开 Tools：每公司一个 calc.run 配置。J1 名称仍为 API Test Calculator Edited，其他公司带测试前缀。Calculator Agent 已绑定，No Tools 未绑定；J1 还保留 HR Agent。
4. 在 J2 测试 Calculator 中移除/重新加入测试 Agent，保存并刷新；每次保留公司作用域，恢复到清单中状态。不改 J1 原 HR 绑定。
5. 公司切换后不应看见其他公司的新 Agent/Tools；原有模板共享规则另行处理，不应把模板共享和工具绑定混淆。
6. 暂不拿新 Agent 的 MSW 403 判断真实工具结果。后续先决定扩展 MSW 场景还是改造本地数据库模拟服务，再做工具执行验收；均不需要先调用真实模型。

## 用户后续验收结果

- 五家公司管理页面、Agent/Calculator 绑定、刷新保留及公司隔离通过。
- 8082 测试新 J1 Calculator Agent 正常调用为 200/模型2次/工具1次；No Tools 为 403/模型0次/工具0次。
- 请求前停用/撤权均拒绝，模型0次、工具0次。
- before-tool 第一轮后停用/撤权均为 403/模型1次/工具0次。
- before-second 工具执行后停用/撤权均为 403/模型1次/工具1次，第二轮未发送。
- 用户确认恢复启用和绑定，回到 none 后正常。模型一直使用模拟响应；跨公司执行和真实模型尚未验收。
- 为验证中途配置变化，测试服务只读事务设置 READ_COMMITTED；这不等于修改正式业务事务或数据库全局配置。
- 助手随后在独立临时端口 18082 使用新 J1 Calculator Agent 实测 tool-failure：502/模型1次/工具1次，安全错误，无第二轮和重试；重启 success 实例后为 200/模型2次/工具1次，答案为5。数据库只读、模型模拟，临时进程已关闭，原8082不受影响；未进行浏览器操作。

## 恢复与清理说明

配置暂留用于用户页面测试，不自动清理。需要清理时按 JSON 精确识别新 Agent/Tool；先移除本次新绑定，再通过已支持的管理接口处理。J1 Calculator 是原有配置，不能整条删除，原 HR 授权也不能移除。版本已变化时重新读取，不使用过期版本覆盖。
