export const ai: Record<string, string> = {
  // AI Assistant screen
  'ai.assistant.history': '会话',
  'ai.assistant.closePanels': '收起侧边面板',
  'ai.assistant.showHistory': '显示会话栏',
  'ai.assistant.hideHistory': '收起会话栏',
  'ai.assistant.showEvidence': '显示依据栏',
  'ai.assistant.hideEvidence': '收起依据栏',
  'ai.assistant.newThread': '新会话',
  'ai.assistant.newThreadTitle': '新会话',
  'ai.assistant.searchThreads': '搜索会话',
  'ai.assistant.pinned': '置顶',
  'ai.assistant.justNow': '刚刚',
  'ai.assistant.noThreads': '暂无会话',
  'ai.assistant.noMatches': '没有匹配的会话。',

  'ai.assistant.scope': '检索范围',
  'ai.assistant.scopeNote': '回答只使用 {{company}} 的资料。切换公司请用左侧 GROUP COMPANIES。',
  'ai.assistant.byAssistant': '助手 · 依据 {{count}} 份',
  'ai.assistant.evidence': '依据',
  'ai.assistant.evidenceCount': '{{count}} 份资料',
  'ai.assistant.evidenceEmpty': '回答所依据的资料会显示在这里。',
  // 依据栏跟随到较早那条回答时显示。
  'ai.assistant.evidenceEarlier': '较早回答：{{question}}',
  'ai.assistant.backToLatest': '回到最新',
  'ai.assistant.openAll': '全部展开',
  'ai.assistant.closeAll': '全部收起',
  'ai.assistant.relevance': '相关度 {{percent}}%',
  'ai.assistant.openSource': '打开来源 {{index}}',

  'ai.assistant.typeContract': '合同',
  'ai.assistant.typeInvoice': '发票',
  'ai.assistant.typePolicy': '政策',
  'ai.assistant.typeRecord': '记录',
  'ai.assistant.openFile': '打开文件',
  'ai.assistant.openRecord': '打开记录',
  'ai.assistant.notWired': '尚未接入',

  'ai.assistant.tracePending': '正在检索资料…',
  'ai.assistant.stop': '停止生成',
  'ai.assistant.stopped': '已停止生成',
  'ai.assistant.retry': '重试',

  // 资料里没找到（检索跑了，但命中的资料为空）。
  'ai.assistant.notFoundTitle': '所选资料中没有相关记录',
  'ai.assistant.notFoundBody': '在{{scope}}里检索了 {{count}} 段，没有找到相关内容。可以换个说法，或放宽资料范围。',
  'ai.assistant.notFoundHintScope': '放宽资料范围',
  'ai.assistant.notFoundHintRephrase': '用文件名或记录名重新问',

  // 生成回答前请求失败。
  'ai.assistant.errorTitle': '无法连接助手服务',
  'ai.assistant.errorBody': '请求在生成回答前失败，未产生任何变更。',

  // 读屏播报（视觉隐藏的 live region）。
  'ai.assistant.liveSearching': '正在检索资料',
  'ai.assistant.liveAnswered': '回答已生成，依据 {{count}} 份资料',
  'ai.assistant.liveStopped': '已停止生成',
  'ai.assistant.liveError': '请求失败',
  'ai.assistant.liveNotFound': '回答已生成，没有匹配的资料',
  'ai.assistant.traceScanned': '检索 {{count}} 段',
  'ai.assistant.traceMatched': '命中 {{count}} 段',
  'ai.assistant.traceCited': '引用 {{count}} 份',
  'ai.assistant.traceSeconds': '{{count}} 秒',

  // 模型按钮的占位文案；模型目录尚未接入。
  'ai.assistant.model': '模型',
  'ai.assistant.sourcesScope': '检索资料范围',
  'ai.assistant.scopeAll': '全部资料',
  'ai.assistant.traceScope': '范围：{{scope}}',
  'ai.assistant.copy': '复制',
  'ai.assistant.copied': '已复制',
  'ai.assistant.regenerate': '重新生成',
  'ai.assistant.helpful': '有帮助',
  'ai.assistant.notHelpful': '没帮助',
  // 接入助手服务并回报模型名后使用。
  'ai.assistant.byAssistantModel': '助手 · {{model}} · 依据 {{count}} 份',

  'ai.assistant.composerPlaceholder': '继续追问，或粘贴单号 / 合同号…',
  'ai.assistant.attach': '附件',
  'ai.assistant.send': '发送',

  'ai.assistant.emptyTitle': '可以问合同、发票、政策或人员',
  'ai.assistant.emptyHint': '每条回答都会标注它出自哪个公司、哪份文件或记录、哪一节。',

  // 助手服务尚未接入，不用虚构内容填空。
  'ai.assistant.notConnectedTitle': '助手服务尚未接入',
  'ai.assistant.notConnectedBody': '界面已就绪 —— 接入服务并返回结果后，这里会显示带引用的回答。',
  'ai.assistant.liveNotConnected': '助手服务尚未接入',
}
