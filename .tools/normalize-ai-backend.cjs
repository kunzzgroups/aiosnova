const fs = require('node:fs'), path = require('node:path')
const data = `AI 主密钥必须为 32 字节|The AI storage key must contain 32 bytes.
AI 主密钥必须是有效的 Base64|The AI storage key must be valid Base64.
API Key 不能为空|API Key is required.
API Key 加密失败|API Key encryption failed.
API Key 密文格式异常|Invalid encrypted API Key format.
API Key 解密失败|API Key decryption failed.
API Key 过长或包含非法控制字符|API Key is too long or contains control characters.
OpenRouter 未返回有效的聊天结果|OpenRouter returned no valid chat result.
OpenRouter 未返回预期的流式响应|OpenRouter did not return the expected event stream.
OpenRouter 模型目录中未找到模型：|Model not found in the OpenRouter catalog: 
OpenRouter 模型目录中未找到该模型|Model not found in the OpenRouter catalog.
OpenRouter 目录中未找到这个模型|Model not found in the OpenRouter catalog.
OpenRouter 认证或访问失败，请检查 Provider 保存的 API Key|OpenRouter authentication or access failed. Check the saved Provider API Key.
OpenRouter 请求失败，HTTP 状态码：|OpenRouter request failed. HTTP status: 
OpenRouter 请求达到频率限制，请稍后再试|OpenRouter rate limit reached. Try again later.
OpenRouter 返回了错误，未获得模型回答|OpenRouter returned an error instead of a model reply.
OpenRouter 额度不足，请检查余额或密钥额度|Insufficient OpenRouter credits. Check your balance or key limits.
Provider ID 格式不正确|Invalid Provider ID.
Provider 不存在|Provider not found.
Provider 保存失败|Unable to save the Provider.
Provider 名称|Provider name
Provider 密钥无法解密，请检查 AI 主密钥配置|Unable to decrypt the Provider key. Check the AI storage key configuration.
Provider 已发生变化，请刷新后重试|Provider changed. Reload and try again.
Provider 已存在，请检查名称后重试|Provider already exists. Check the name and try again.
Provider 已改变，请刷新后重试|Provider changed. Reload and try again.
Provider 已被修改或删除，请刷新列表后重试|Provider was changed or deleted. Reload and try again.
Provider 已被修改或删除，请刷新后重试|Provider was changed or deleted. Reload and try again.
Provider 已被修改，请刷新列表后重试|Provider was modified. Reload and try again.
Provider 状态已改变，请刷新列表后重试|Provider state changed. Reload and try again.
temperature 必须在 0 到 2 之间|Temperature must be between 0 and 2.
一次最多删除 100 个 Provider|Delete at most 100 Providers at a time.
上下文容量格式异常|Invalid context window format.
上下文容量超出有效范围|Context window is out of range.
上下文长度必须大于 0|Context window must be greater than zero.
上下文长度必须大于 0，未知时请不填写|Context window must be greater than zero, or omitted when unknown.
不支持这个 AI 密钥版本|Unsupported AI key version.
不能为空| is required.
不能重复提交同一个 Provider|Do not submit the same Provider twice.
不能重复选择同一个模型|Do not select the same model twice.
公司 ID|Company ID
公司 ID 不能为空|Company ID is required.
公司 ID 只能包含英文字母、数字、下划线和连字符|Company ID may contain letters, digits, underscores and hyphens only.
公司 ID 和 Provider ID 不能为空|Company ID and Provider ID are required.
公司 ID 格式不正确|Invalid company ID.
公司、Provider、模型配置 ID 或版本号不正确|Invalid company, Provider, model configuration ID or version.
公司、Provider、测试模型或版本号不正确|Invalid company, Provider, test model or version.
内容块只支持 text 和 image_url|Content parts must use text or image_url.
删除列表不能包含空项|Deletion targets must not contain null entries.
删除数量不一致，本次操作已取消|Deleted count did not match. The operation was cancelled.
单张图片不能为空，大小不能超过 2 MiB|Each image must contain data and be no larger than 2 MiB.
同步事务没有返回结果|The sync transaction returned no result.
图片 Base64 数据格式不正确|Invalid Base64 image data.
图片只支持 PNG、JPEG、WebP 或 GIF 的 Base64 数据|Images must contain Base64 PNG, JPEG, WebP or GIF data.
图片地址必须是字符串|Image URL must be a string.
图片必须使用 Base64 data URL|Images must use Base64 data URLs.
当前 Provider 中未找到该模型配置|Model configuration not found under this Provider.
当前仅支持 OpenRouter 官方连接|Only the official OpenRouter endpoint is supported.
当前公司中未找到该 Provider|Provider not found in this company.
当前测试仅支持 https://openrouter.ai/api/v1|Connection tests currently support https://openrouter.ai/api/v1 only.
当前测试传输尚未配置流式响应|The test transport does not provide streaming responses.
当前聊天入口只支持 OpenRouter 官方服务|This chat endpoint supports the official OpenRouter service only.
所有消息的文字总长度不能超过 100000|Total message text must not exceed 100000 characters.
文字内容块不能为空|Text content parts must not be empty.
文字消息不能为空|Text messages must not be empty.
新增后无法读取模型配置|Unable to read the model configuration after creation.
新增模型失败|Unable to create the model.
无法读取模型能力，请稍后再试|Unable to load model capabilities. Try again later.
无法连接 OpenRouter|Unable to connect to OpenRouter.
无法连接模型服务|Unable to connect to the model service.
无法连接模型流式服务|Unable to connect to the model streaming service.
更新后无法读取模型配置|Unable to read the model configuration after updating.
服务地址|Base URL
模型 ID|Model ID
模型 ID 只能包含不带空格的可打印 ASCII 字符|Model ID must contain printable ASCII characters without spaces.
模型保存失败|Unable to save the model.
模型列表请求失败|Model list request failed.
模型名称|Model name
模型拒绝回答或输出被过滤，请调整图片或问题后重试|The reply was refused or filtered. Adjust the images or question and try again.
模型描述不能超过 10000 个字符|Model description must not exceed 10000 characters.
模型未提供文字回答，且未报告达到输出上限；请更换模型或问题后重试|The model returned no text and did not report an output limit. Try another model or question.
模型没有返回有效的文字回答|The model returned no valid text reply.
模型流式读取超时|Model stream timed out.
模型目录为空或字段不符合存储要求，未执行同步|The catalog is empty or contains invalid fields. No models were synced.
模型目录同步已中断|Model catalog sync was interrupted.
模型目录存在缺少 ID 的记录|The model catalog contains an entry without an ID.
模型目录存在重复 ID：|The model catalog contains a duplicate ID: 
模型目录格式异常：缺少 data 数组|Invalid model catalog: data array is missing.
模型目录解析异常|Unable to parse the model catalog.
模型类型|Model type
模型类型不正确|Invalid model type.
模型能力尚未确认，请先读取模型能力|Model capabilities are unknown. Refresh capabilities before enabling or running this model.
模型能力格式异常：预期是数组|Invalid model capability format: expected an array.
模型能力格式异常：预期是文字|Invalid model capability format: expected text.
模型请求失败，HTTP 状态码：|Model request failed. HTTP status: 
模型请求已中断|Model request was interrupted.
模型请求构建失败或响应格式异常|Unable to build the model request or parse its response.
模型请求被中断|Model request was interrupted.
模型请求超时|Model request timed out.
模型请求超时，请稍后再试|Model request timed out. Try again later.
模型达到本次输出上限（2048 tokens），尚未生成有效文字回答|The model reached the output limit (2048 tokens) without producing a text reply.
模型返回了工具调用，但当前聊天入口尚未支持执行工具|The model requested a tool call, which this chat endpoint does not yet support.
模型返回了当前入口不支持的回答格式|The model returned an unsupported reply format.
模型连接成功|Model connection successful.
模型配置 ID|Model configuration ID
模型配置发生唯一键冲突，请刷新列表后确认|Model configuration conflicts with an existing record. Reload to confirm.
模型配置发生并发变化，本次同步已取消，请重试|Model configurations changed concurrently. Sync was cancelled; try again.
模型配置已修改或删除，请刷新列表后重试|Model configuration was changed or deleted. Reload and try again.
模型配置已发生变化，请刷新列表后重试|Model configuration changed. Reload and try again.
模型配置已改变，本次同步已取消，请重试|Model configuration changed. Sync was cancelled; try again.
模型配置已被修改，请刷新列表后重试|Model configuration was modified. Reload and try again.
每个 Provider 都必须提供 ID 和版本号|Provide the ID and version for every Provider.
每条消息的内容块数量必须在 1 到 32 之间|Each message must contain between 1 and 32 content parts.
每次请求最多包含 4 张图片|Each request may contain at most four images.
流式请求构建失败或响应格式异常|Unable to build the streaming request or parse its response.
测试期间 Provider 已改变，结果已作废，请重新测试|Provider changed during the test. Discard this result and test again.
消息不能为空，长度不能超过 20000|Message must be non-empty and no longer than 20000 characters.
消息内容不能为空|Message content is required.
消息内容必须是文字或内容数组|Message content must be text or an array of content parts.
消息数量必须在 1 到 100 条之间|Provide between 1 and 100 messages.
消息角色只支持 system、user、assistant|Message roles must be system, user or assistant.
版本号不能小于 0|Version must not be negative.
目前只支持 https://openrouter.ai/api/v1|Only https://openrouter.ai/api/v1 is currently supported.
目前只支持同步 OpenRouter 官方目录|Only the official OpenRouter catalog can currently be synced.
目前只支持读取 OpenRouter 官方模型能力|Only official OpenRouter model capabilities are supported.
目前只有 user 消息支持内容数组|Only user messages may contain arrays of content parts.
等待模型流式响应超时|Timed out waiting for the model stream.
聊天请求不能为空|Chat request is required.
聊天请求失败|Chat request failed.
能力元数据缺失或格式异常|Capability metadata is missing or invalid.
能力更新事务没有返回结果|The capability update transaction returned no result.
认证失败，请检查 OpenRouter API Key|Authentication failed. Check the OpenRouter API Key.
该 Provider 尚未配置这个模型，请先同步模型|This Provider has no configuration for this model. Sync the catalog first.
该 Provider 已配置这个模型，请编辑已有记录|This Provider already has this model. Edit the existing configuration.
请先保存 Provider API Key|Save the Provider API Key first.
请先停用 Provider，再删除|Disable the Provider before deleting it.
请先停用所有选中的模型|Disable all selected models first.
请先停用模型，再删除|Disable the model before deleting it.
请先启用 Provider|Enable the Provider first.
请填写 API Key|Enter an API Key.
请填写模型 ID|Enter a model ID.
请填写模型服务地址|Enter the model service URL.
请提供 Provider 版本号|Provide the Provider version.
请提供启用状态和版本号|Provide the enabled state and version.
请提供有效的模型 ID|Provide a valid model ID.
请提供有效的模型 ID，长度不能超过 200|Provide a valid model ID no longer than 200 characters.
请提供模型版本号|Provide the model version.
请提供每个模型的 ID 和版本号|Provide the ID and version for every model.
请求中必须包含 user 消息|At least one user message is required.
请求参数或模型响应格式异常|Invalid request parameters or model response format.
请求失败|Request failed.
请求达到频率限制，请稍后再试|Rate limit reached. Try again later.
请至少选择一个 Provider|Select at least one Provider.
请选择 1 到 100 个模型|Select between 1 and 100 models.
读取 OpenRouter 模型目录失败，未执行同步|Unable to load the OpenRouter catalog. No models were synced.
读取 OpenRouter 模型目录失败，未更新能力|Unable to load the OpenRouter catalog. Capabilities were not updated.
读取模型回答时连接中断|The connection closed while reading the model reply.
读取模型目录失败，HTTP 状态码：|Unable to load the model catalog. HTTP status: 
读取模型目录失败，请稍后重试|Unable to load the model catalog. Try again later.
读取模型目录的请求被中断|The model catalog request was interrupted.
读取模型能力已中断|Loading model capabilities was interrupted.
读取模型能力的请求已中断|The model capability request was interrupted.
读取模型能力的请求被中断|The model capability request was interrupted.
读取模型能力超时|Loading model capabilities timed out.
这个 Provider 尚未保存 API Key|This Provider has no saved API Key.
这个 Provider 已停用，无法调用模型|This Provider is disabled and cannot run models.
这个模型不支持图片输入|This model does not support image input.
这个模型不支持文字聊天|This model does not support chat.
这个模型未启用，无法执行|This model is disabled and cannot run.
选中的 Provider 包含启用项，请先全部停用|Some selected Providers are enabled. Disable all of them first.
部分 Provider 状态已改变，本次批量删除已取消，请刷新后重试|Some Providers changed. Batch deletion was cancelled; reload and try again.
部分模型不属于当前 Provider 或已被删除|Some models belong to another Provider or were deleted.
部分模型配置已发生变化，请刷新列表后重试|Some model configurations changed. Reload and try again.
部分模型配置已被修改，请刷新列表后重试|Some model configurations were modified. Reload and try again.
长度不能超过 | must not exceed `
const map = new Map(data.split('\n').map(line => { const i=line.indexOf('|');return [line.slice(0,i),line.slice(i+1)] }))
for (const dir of ['server/src/main/java/com/aiosnova/ai', 'server/src/test/java/com/aiosnova/ai']) {
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.java'))) {
    const target = path.join(dir,file)
    let source=fs.readFileSync(target,'utf8')
    // Only exact Java string literals are changed; comments and user data are preserved.
    source=source.replace(/"([^"\r\n]*[\u3400-\u9fff][^"\r\n]*)"/g,(whole,value)=> map.has(value)?JSON.stringify(map.get(value)):whole)
    fs.writeFileSync(target,source)
  }
}
console.log('Normalized AI backend messages to English.')
