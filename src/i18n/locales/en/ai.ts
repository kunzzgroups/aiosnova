export const ai: Record<string, string> = {
  // AI Assistant screen
  'ai.assistant.history': 'Chats',
  'ai.assistant.closePanels': 'Close side panels',
  'ai.assistant.showHistory': 'Show chats panel',
  'ai.assistant.hideHistory': 'Hide chats panel',
  'ai.assistant.showEvidence': 'Show evidence panel',
  'ai.assistant.hideEvidence': 'Hide evidence panel',
  'ai.assistant.newThread': 'New chat',
  'ai.assistant.newThreadTitle': 'New chat',
  'ai.assistant.searchThreads': 'Search chats',
  'ai.assistant.pinned': 'Pinned',
  'ai.assistant.justNow': 'just now',
  'ai.assistant.noThreads': 'No chats yet',
  'ai.assistant.noMatches': 'No chats match that search.',
  'ai.assistant.deleteThread': 'Delete chat',

  'ai.assistant.scope': 'Scope',
  'ai.assistant.scopeNote':
    'Answers only use {{company}} sources. Switch company from GROUP COMPANIES.',
  'ai.assistant.byAssistant': 'Assistant · {{count}} sources',
  'ai.assistant.evidence': 'Evidence',
  'ai.assistant.evidenceCount': '{{count}} sources',
  'ai.assistant.evidenceEmpty': 'Sources behind an answer appear here.',
  'ai.assistant.evidenceEarlier': 'Earlier answer: {{question}}',
  'ai.assistant.backToLatest': 'Back to latest',
  'ai.assistant.openAll': 'Expand all',
  'ai.assistant.closeAll': 'Collapse all',
  'ai.assistant.relevance': 'Relevance {{percent}}%',
  'ai.assistant.openSource': 'Open source {{index}}',

  'ai.assistant.typeContract': 'Contract',
  'ai.assistant.typeInvoice': 'Invoice',
  'ai.assistant.typePolicy': 'Policy',
  'ai.assistant.typeRecord': 'Record',
  'ai.assistant.openFile': 'Open file',
  'ai.assistant.openRecord': 'Open record',
  'ai.assistant.notWired': 'Not connected yet',

  'ai.assistant.tracePending': 'Searching your sources…',
  'ai.assistant.stop': 'Stop generating',
  'ai.assistant.stopped': 'Generation stopped',
  'ai.assistant.retry': 'Retry',

  'ai.assistant.notFoundTitle': 'No match in the selected sources',
  'ai.assistant.notFoundBody':
    'Searched {{count}} passages in {{scope}} and found nothing relevant. Try different wording, or widen the source scope.',
  'ai.assistant.notFoundHintScope': 'Widen the source scope',
  'ai.assistant.notFoundHintRephrase': 'Rephrase using a document or record name',

  'ai.assistant.errorTitle': 'Could not reach the assistant',
  'ai.assistant.errorBody':
    'The request failed before an answer was produced. Nothing was changed.',

  'ai.assistant.liveSearching': 'Searching your sources',
  'ai.assistant.liveAnswered': 'Answer ready, {{count}} sources',
  'ai.assistant.liveStopped': 'Generation stopped',
  'ai.assistant.liveError': 'The request failed',
  'ai.assistant.liveNotFound': 'Answer ready, no matching sources',
  'ai.assistant.traceScanned': 'Scanned {{count}}',
  'ai.assistant.traceMatched': 'matched {{count}}',
  'ai.assistant.traceCited': 'cited {{count}}',
  'ai.assistant.traceSeconds': '{{count}}s',

  'ai.assistant.model': 'Model',
  'ai.assistant.sourcesScope': 'Sources to search',
  'ai.assistant.scopeAll': 'All sources',
  'ai.assistant.traceScope': 'in {{scope}}',
  'ai.assistant.copy': 'Copy',
  'ai.assistant.copied': 'Copied',
  'ai.assistant.regenerate': 'Regenerate',
  'ai.assistant.helpful': 'Helpful',
  'ai.assistant.notHelpful': 'Not helpful',
  'ai.assistant.byAssistantModel': 'Assistant · {{model}} · {{count}} sources',

  'ai.assistant.composerPlaceholder':
    'Ask a follow-up, or paste an invoice or contract number…',
  'ai.assistant.attach': 'Attach',
  'ai.assistant.send': 'Send',

  'ai.assistant.emptyTitle': 'Ask about contracts, invoices, policies or people',
  'ai.assistant.emptyHint':
    'Every answer cites the company, the file or record, and the section it came from.',

  'ai.assistant.notConnectedTitle': 'Assistant service not connected',
  'ai.assistant.notConnectedBody':
    'The screen is ready - once a service answers, this is where the cited reply appears.',
  'ai.assistant.liveNotConnected': 'No assistant service connected',

  // ---------- Composer: drag/drop + attached files + thread groups ----------
  'ai.assistant.dropFilesHere': 'Drop files to attach',
  'ai.assistant.today': 'Today',
  'ai.assistant.yesterday': 'Yesterday',
  'ai.assistant.earlier': 'Earlier',
  'ai.assistant.attachedFiles': 'Attached to this message',
  'ai.assistant.removeFile': 'Remove {{name}}',
  'ai.assistant.analyzeAttachments': 'Analyze the attached file(s).',
  'ai.assistant.storedIn': 'Stored {{name}} in {{base}}.',

  // AttachMenu
  'ai.assistant.attachToChat': 'Attach to this chat',
  'ai.assistant.attachToChatHint': 'Kept in this conversation only, not indexed.',
  'ai.assistant.attachToKnowledge': 'Store in a knowledge base…',
  'ai.assistant.attachToKnowledgeHint':
    'Indexed and available to every agent that uses the base.',
  'ai.assistant.storeTitle': 'Store in a knowledge base',
  'ai.assistant.storeHint':
    'The file is queued for ingestion and starts as Processing.',
  'ai.assistant.storeConfirm': 'Store',
  'ai.assistant.storeBase': 'Knowledge base',
  'ai.assistant.storeFileLabel': 'File: {{name}}',
  'ai.assistant.storeNoBases':
    'No knowledge bases in this company yet. Create one on the Knowledge screen first.',
  'ai.assistant.attachErrLoadBases': 'Could not load knowledge bases.',
  'ai.assistant.attachErrStore': 'Could not store this file.',

  'ai.assistant.storeKind': 'Kind',
  'ai.assistant.storeNoBasesOfKind':
    'No {{kind}} base in this company yet. Create one on the Knowledge screen first.',
  'ai.assistant.storeFile': 'File',
  'ai.assistant.storeDocDetails': 'Document details',
  'ai.assistant.storeSkillDetails': 'Skill details',
  'ai.assistant.storeSkillHint':
    'Describe what this skill does so the assistant knows when to invoke it.',
  'ai.assistant.storeSkillDescPlaceholder':
    'e.g. Read a scanned invoice and return its line items.',
  'ai.assistant.storeDataDetails': 'Data source details',
  'ai.assistant.storeDataHint':
    'Pick the source kind, then list any connection fields you need.',
  'ai.assistant.storeDataAddField': 'Add config field',
  'ai.assistant.attachErrConfigInvalid': 'Config must be valid JSON.',

  'ai.assistant.agentAuto': 'Auto',
  'ai.assistant.settingsTitle': 'Assistant settings',
  'ai.assistant.settingsHint': 'Preferences stored on this device.',
  'ai.assistant.settingsEvidenceAction': 'Evidence click action',
  'ai.assistant.settingsEvidenceActionHint':
    'What happens when you click "Open source" on an evidence card.',
  'ai.assistant.settingsEvidenceNavigate': 'Open in this tab',
  'ai.assistant.settingsEvidenceNewTab': 'Open in a new tab',

  'ai.assistant.modelFromAgent': 'from agent',
  'ai.assistant.modelFromAgentHint':
    'This model is set by the selected agent. Clear the agent to use your own choice.',

  // Knowledge screen
  'ai.knowledge.title': 'Knowledge Bases',
  'ai.knowledge.listTitle': 'Knowledge Bases',
  'ai.knowledge.create': 'Create',
  'ai.knowledge.createTitle': 'New knowledge base',
  'ai.knowledge.renameTitle': 'Rename knowledge base',
  'ai.knowledge.renameHint': 'Renaming keeps every document where it is.',
  'ai.knowledge.renameAgentsNote':
    'Agent assignment is managed on the Agents tab, so it is not edited here.',
  'ai.knowledge.save': 'Save',
  'ai.knowledge.edit': 'Edit',
  'ai.knowledge.rename': 'Rename',
  'ai.knowledge.delete': 'Delete',
  'ai.knowledge.rowActions': 'Actions for {{name}}',
  'ai.knowledge.deleting': 'Deleting…',
  'ai.knowledge.deleteTitle': 'Delete {{name}}?',
  'ai.knowledge.deleteBody':
    'The knowledge base, its {{count}} documents and every agent assignment go with it.',
  'ai.knowledge.deleteWarning': 'This cannot be undone.',
  'ai.knowledge.msgUpdated': 'Knowledge base updated.',
  'ai.knowledge.msgDeleted': 'Knowledge base deleted.',
  'ai.knowledge.errUpdate': 'Unable to update this knowledge base.',
  'ai.knowledge.errDelete': 'Unable to delete this knowledge base.',
  'ai.knowledge.createHint': 'Name it, then tick the agents that may search it.',
  'ai.knowledge.fieldName': 'Name',
  'ai.knowledge.fieldType': 'Type',
  'ai.knowledge.fieldDescription': 'Description',
  'ai.knowledge.fieldCompany': 'Company',
  'ai.knowledge.companyLocked':
    'Created in the active company. Switch company from the sidebar to create one elsewhere.',
  'ai.knowledge.namePlaceholder': 'e.g. HR Knowledge',
  'ai.knowledge.descriptionPlaceholder': 'What this knowledge base holds',
  'ai.knowledge.cancel': 'Cancel',
  'ai.knowledge.back': 'Back',
  'ai.knowledge.addSourceTitle': 'Add source',
  'ai.knowledge.addSourceHint':
    'The document is queued for ingestion and starts as Processing.',
  'ai.knowledge.add': 'Add',
  'ai.knowledge.fieldTitle': 'Name',
  'ai.knowledge.titlePlaceholder': 'e.g. Fire Safety Procedure.pdf',
  'ai.knowledge.inheritAgents': 'Use the knowledge base default ({{count}} agents)',
  'ai.knowledge.inheritAgentsHint':
    'Untick to give this one document its own agents instead.',
  'ai.knowledge.docAgentsTitle': 'Agents for this document',
  'ai.knowledge.msgSourceAdded': 'Source added.',
  'ai.knowledge.errAddSource': 'Unable to add this source.',
  'ai.knowledge.errTitleRequired': 'Document name is required.',
  'ai.knowledge.agentsHint':
    'Optional. These are the agents of the ACTIVE company. Ticking one lets it use this base when answering.',
  'ai.knowledge.agentsSelected': '{{count}} selected',
  'ai.knowledge.agentsSearchPlaceholder': 'Search agents...',
  'ai.knowledge.agentsSearchAria': 'Search agents',
  'ai.knowledge.agentsSearchNoMatch': 'No agent matches that search.',
  'ai.knowledge.msgCreated': 'Knowledge base created.',
  'ai.knowledge.errCreate': 'Unable to create this knowledge base.',
  'ai.knowledge.errNameRequired': 'Knowledge base name is required.',
  'ai.knowledge.errNoCompany': 'No active company to create this in.',
  'ai.knowledge.companyScope': 'Showing the knowledge bases of {{company}}.',
  'ai.knowledge.companyScopeUnknown':
    'Showing knowledge bases for the selected company.',
  'ai.knowledge.loading': 'Loading…',
  'ai.knowledge.empty': 'No knowledge bases for this company yet.',
  'ai.knowledge.errLoadBases': 'Unable to load knowledge bases.',
  'ai.knowledge.errLoadBase': 'Unable to load this knowledge base.',
  'ai.knowledge.documentCount': '{{count}} documents',
  'ai.knowledge.agentCount': 'Used by {{count}} agents',
  'ai.knowledge.agentCountNone': 'Not used by any agent',

  'ai.knowledge.emptyFiltered': 'No knowledge bases are linked to this agent.',
  'ai.knowledge.filteredByAgent': 'Filtered by agent: {{name}}',

  'ai.knowledge.statusReady': 'Ready',
  'ai.knowledge.statusProcessing': 'Processing',
  'ai.knowledge.statusFailed': 'Failed',
  'ai.knowledge.statusEmpty': 'Empty',
  'ai.knowledge.statusClickHint': 'Click to change status',
  'ai.knowledge.errStatus': 'Could not change the status.',

  'ai.knowledge.tabsAria': 'Knowledge base sections',
  'ai.knowledge.tabDocuments': 'Documents',
  'ai.knowledge.tabAgents': 'Agents',
  'ai.knowledge.tabSkills': 'Skills',
  'ai.knowledge.tabData': 'Data',

  'ai.knowledge.kindDocument': 'Documents',
  'ai.knowledge.kindSkill': 'Skills',
  'ai.knowledge.kindData': 'Data',
  'ai.knowledge.fieldKind': 'Type',
  'ai.knowledge.kindHint':
    'Documents are indexed for search. Skills are callable actions. Data sources are queried live.',
  'ai.knowledge.kindHint_document': 'Files and records indexed for retrieval.',
  'ai.knowledge.kindHint_skill': 'Callable actions the assistant can invoke.',
  'ai.knowledge.kindHint_data': 'Live tables, APIs or databases.',

  'ai.knowledge.skillsTitle': 'Skills',
  'ai.knowledge.skillsHint': 'Callable actions in this knowledge base.',
  'ai.knowledge.skillsEmpty': 'No skills defined yet.',

  'ai.knowledge.dataTitle': 'Data sources',
  'ai.knowledge.dataHint': 'Live tables, APIs and databases this base exposes.',
  'ai.knowledge.dataEmpty': 'No data sources connected yet.',

  'ai.knowledge.addSource': 'Add source',
  'ai.knowledge.searchPlaceholder': 'Search documents...',
  'ai.knowledge.searchAria': 'Search documents',
  'ai.knowledge.filterStatus': 'Status',
  'ai.knowledge.filterAll': 'All',
  'ai.knowledge.colName': 'Name',
  'ai.knowledge.colType': 'Type',
  'ai.knowledge.colStatus': 'Status',
  'ai.knowledge.colUploaded': 'Uploaded',
  'ai.knowledge.documentsEmpty': 'No documents in this knowledge base yet.',
  'ai.knowledge.documentsEmptyFiltered': 'No documents match these filters.',
  'ai.knowledge.colAgents': 'Agents',
  'ai.knowledge.colSource': 'Source',
  'ai.knowledge.colActions': 'Actions',
  'ai.knowledge.noAgentsReach': 'No agent',
  'ai.knowledge.sourceInherited': 'Inherited',
  'ai.knowledge.sourceOverride': 'Override',
  'ai.knowledge.saving': 'Saving…',
  'ai.knowledge.errAssign': 'Unable to save this assignment.',

  'ai.knowledge.colDescription': 'Description',
  'ai.knowledge.colSchema': 'Inputs',
  'ai.knowledge.colKind': 'Kind',
  'ai.knowledge.colConfig': 'Config',
  'ai.knowledge.colSynced': 'Last synced',

  'ai.knowledge.agentsAppliedTitle': 'Applied to this knowledge base',
  'ai.knowledge.agentsAppliedHint':
    'Every document inherits these agents unless a document overrides them.',
  'ai.knowledge.noAgentsInCompany': 'No agents in this company yet.',
  'ai.knowledge.overridesTitle': 'Per-document overrides',
  'ai.knowledge.overridesHint': 'An override replaces the default for that one document.',
  'ai.knowledge.overrideEdit': 'Override',
  'ai.knowledge.overrideClose': 'Close',
  'ai.knowledge.overrideHint':
    'Ticking writes an override. Untick everything to withhold this document from every agent.',
  'ai.knowledge.overrideReset': 'Use base default',

  'ai.knowledge.typeContract': 'Contract',
  'ai.knowledge.typeInvoice': 'Invoice',
  'ai.knowledge.typePolicy': 'Policy',
  'ai.knowledge.typeRecord': 'Record',

  // Add source drawer
  'ai.knowledge.fieldFile': 'File',
  'ai.knowledge.download': 'Download',
  'ai.knowledge.fieldSkillName': 'Skill name',
  'ai.knowledge.fieldSkillDescription': 'Description',
  'ai.knowledge.fieldSkillDescriptionPlaceholder': 'What this skill does',
  'ai.knowledge.fieldDataSourceName': 'Source name',
  'ai.knowledge.fieldDataSourceKind': 'Kind',
  'ai.knowledge.fieldDataSourceConfig': 'Config',
  'ai.knowledge.skillFileHint': 'Optional: attach a spec, sample, or screenshot.',
  'ai.knowledge.dataFileHint':
    'Optional: a schema dump, sample export, or screenshot.',
  'ai.knowledge.addConfigField': 'Add config field',

  // Errors
  'ai.knowledge.errSkillNameRequired': 'Skill name is required.',
  'ai.knowledge.errDataSourceNameRequired': 'Source name is required.',

  // ---------- Template library ----------
  'ai.knowledge.useTemplate': 'Use template',
  'ai.knowledge.useTemplateTitle': 'Use a template',
  'ai.knowledge.useTemplateHint':
    'Adopt a snapshot of a template into a new base of this company. The template itself is not modified.',
  'ai.knowledge.useTemplateConfirm': 'Create base',
  'ai.knowledge.useTemplateEmpty': 'No templates are available yet.',
  'ai.knowledge.templatePick': 'Template',
  'ai.knowledge.templateItemCount': '{{count}} items',
  'ai.knowledge.templateTarget': 'New base',
  'ai.knowledge.templateTargetHint':
    'The new base belongs to the ACTIVE company. Ticking agents afterwards works the same as on any base.',
  'ai.knowledge.adoptDone': 'Created "{{name}}" with {{count}} item(s).',
  'ai.knowledge.adoptErr': 'Could not adopt this template.',

  // ---------- Promote to template ----------
  'ai.knowledge.promote': 'Promote to template',
  'ai.knowledge.promoteTitle': 'Promote to template library',
  'ai.knowledge.promoteHint':
    'Adds a snapshot of this base to the tenant template library. The base itself stays where it is.',
  'ai.knowledge.promoteBody': 'Promote "{{name}}" to the template library?',
  'ai.knowledge.promoteName': 'Template name',
  'ai.knowledge.promoteDone': 'Added "{{name}}" to the template library.',
  'ai.knowledge.promoteErr': 'Could not promote this base.',
  'ai.knowledge.promoteVisibility': 'Who can see this template?',
  'ai.knowledge.promoteVisibilityHint':
    'The owner company is always included. Tick others to share the template with them.',
  'ai.knowledge.promoteOwner': 'Owner',

  // Promote / visibility picker
  'ai.knowledge.promoteSearch': 'Search companies...',
  'ai.knowledge.promoteSelected': '{{selected}} of {{total}} selected',
  'ai.knowledge.promoteSelectAll': 'Select all',
  'ai.knowledge.promoteSelectNone': 'Clear',
  'ai.knowledge.promoteCopyFrom': 'Copy from…',
  'ai.knowledge.promoteNoMatch': 'No company matches that search.',

  // Template management
  'ai.knowledge.manageTemplates': 'Manage templates',
  'ai.knowledge.templatesTitle': 'Template library',
  'ai.knowledge.templatesHint':
    'Templates any of your companies can see. Editing here changes who can adopt each template.',
  'ai.knowledge.templatesEmpty': 'No templates are visible to you yet.',
  'ai.knowledge.colOwner': 'Owner',
  'ai.knowledge.readOnly': 'Read only',
  'ai.knowledge.templatesScope':
    'Templates visible to {{company}}. Only the owning company can edit or delete.',
  'ai.knowledge.templatesEmptyForCompany':
    'No templates are visible to this company yet.',
  'ai.knowledge.promoteVisibilityEditHint':
    'The owner company is always included and cannot be removed.',
  'ai.knowledge.errLoadTemplates': 'Unable to load templates.',
  'ai.knowledge.editTemplateTitle': 'Edit template',
  'ai.knowledge.editTemplateHint':
    'Changing visibility affects who can adopt this template. Existing adoptions are not affected.',
  'ai.knowledge.colVisibility': 'Visible to',
  'ai.knowledge.errTemplateNoVisibility': 'Pick at least one company.',
  'ai.knowledge.errTemplateUpdate': 'Could not update this template.',
  'ai.knowledge.errTemplateDelete': 'Could not delete this template.',
  'ai.knowledge.msgTemplateUpdated': 'Template updated.',
  'ai.knowledge.msgTemplateDeleted': 'Template deleted.',
  'ai.knowledge.deleteTemplateTitle': 'Delete "{{name}}"?',
  'ai.knowledge.deleteTemplateBody':
    'Existing adoptions are not affected. The template will no longer be available.',

  // ---------- Category label (adopt drawer) ----------
  'ai.knowledge.fieldCategory': 'Category',

  // AI Agents screen
  'ai.agents.listTitle': 'Agents',
  'ai.agents.newAgent': 'New agent',
  'ai.agents.cancel': 'Cancel',
  'ai.agents.create': 'Create',
  'ai.agents.save': 'Save',
  'ai.agents.edit': 'Edit',
  'ai.agents.newTitle': 'New agent',
  'ai.agents.newHint': 'Name the agent, then tick the knowledge bases it may search.',
  'ai.agents.editTitle': 'Edit agent',
  'ai.agents.editHint':
    'Ticking a knowledge base applies it to this agent - the same ticks appear on that base.',
  'ai.agents.fieldName': 'Name',
  'ai.agents.fieldDescription': 'Description',
  'ai.agents.namePlaceholder': 'e.g. HR Agent',
  'ai.agents.descriptionPlaceholder': 'What this agent answers',
  'ai.agents.knowledgeTitle': 'Knowledge bases',
  'ai.agents.knowledgeHint': 'Base-level default: documents inherit it unless overridden.',
  'ai.agents.knowledgeSearchPlaceholder': 'Search knowledge bases...',
  'ai.agents.knowledgeSearchAria': 'Search knowledge bases',
  'ai.agents.knowledgeSearchNoMatch': 'No knowledge base matches that search.',
  'ai.agents.knowledgeSelected': '{{count}} selected',
  'ai.agents.noKnowledgeBases': 'No knowledge bases for this company yet.',
  'ai.agents.empty': 'No agents for this company yet.',
  'ai.agents.emptyFiltered': 'No agents are linked to this knowledge base.',
  'ai.agents.filteredByKnowledge': 'Filtered by knowledge base: {{name}}',

  'ai.agents.loading': 'Loading…',
  'ai.agents.saving': 'Saving…',
  'ai.agents.companyScope': 'Showing the agents of {{company}}.',
  'ai.agents.companyScopeUnknown': 'Showing agents for the selected company.',
  'ai.agents.colName': 'Name',
  'ai.agents.colDescription': 'Description',
  'ai.agents.colKnowledge': 'Knowledge bases',
  'ai.agents.colStatus': 'Status',
  'ai.agents.colActions': 'Actions',
  'ai.agents.colModel': 'Model',
  'ai.agents.modelAuto': 'Auto',
  'ai.agents.modelTitle': 'Model',
  'ai.agents.modelHint':
    'Which LLM this agent uses. Auto picks the best model for its knowledge.',
  'ai.agents.fieldProvider': 'Provider',
  'ai.agents.fieldModel': 'Model',
  'ai.agents.fieldTemperature': 'Temperature',
  'ai.agents.advanced': 'Advanced',

  'ai.agents.knowledgeCount': '{{count}} knowledge bases',
  'ai.agents.knowledgeCountNone': 'None',
  'ai.agents.statusActive': 'Active',
  'ai.agents.statusDraft': 'Draft',
  'ai.agents.statusDisabled': 'Disabled',
  'ai.agents.errLoad': 'Unable to load agents.',
  'ai.agents.errSave': 'Unable to save this agent.',
  'ai.agents.errNameRequired': 'Agent name is required.',
  'ai.agents.msgCreated': 'Agent created.',
  'ai.agents.msgUpdated': 'Agent updated.',

  // Shared
  'common.dropFileHere': 'Drag files here from your desktop',
  'common.fileDropOr': 'Or click to browse · Or paste (Ctrl+V)',
  'common.addMoreFiles': 'Add more files',
  'common.fileDropHint': 'PDF, DOCX, XLSX, PNG, JPG, TXT up to 10 MB',
  'common.fileDropPasteHint': 'You can also paste a copied file (Ctrl+V).',
  'common.remove': 'Remove',
  'common.kvEmpty': 'No fields yet.',
  'common.kvKey': 'key',
  'common.kvValue': 'value',
  'common.kvAdd': 'Add field',
  'common.saving': 'Saving…',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.dismiss': 'Dismiss',
}