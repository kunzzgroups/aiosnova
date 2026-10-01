export const org: Record<string, string> = {
  // shared field labels
  'org.fieldCode': '编码',
  'org.fieldName': '名称',
  'org.fieldStatus': '状态',
  'org.fieldParent': '上级',
  'org.fieldType': '类型',
  'org.fieldDescription': '描述',
  'org.fieldUser': '用户',
  'org.fieldCompany': '公司',
  'org.fieldOrganization': '组织架构',
  'org.fieldPosition': '职位',
  'org.fieldPrimary': '主要',

  // shared table headers
  'org.colCode': '编码',
  'org.colName': '名称',
  'org.colEmail': '邮箱',
  'org.colMembers': '成员数',
  'org.colUserStatus': '用户状态',
  'org.colTenant': '租户',
  'org.colMembership': '成员关系',

  // shared actions
  'org.actionAdd': '添加',

  // companies
  'org.companies.title': '公司',
  'org.companies.directory': '公司目录',
  'org.companies.newCompany': '新建公司',
  'org.companies.newTitle': '新建公司',
  'org.companies.newHint': '在当前租户下创建法人主体；成员通过成员关系加入该公司。',
  'org.companies.searchPlaceholder': '搜索名称或编码...',
  'org.companies.searchAria': '搜索名称或编码',
  'org.companies.codePlaceholder': '例如 RETAIL',
  'org.companies.namePlaceholder': '请输入公司名称',
  'org.companies.create': '创建',

  // organization
  'org.organization.title': '组织架构',
  'org.organization.addNode': '新增节点',
  'org.organization.tree': '组织树',
  'org.organization.typeDivision': '事业部',
  'org.organization.typeDepartment': '部门',
  'org.organization.typeTeam': '团队',
  'org.organization.typeOther': '其他',

  // positions
  'org.positions.title': '职位',
  'org.positions.addTitle': '新增职位',
  'org.positions.catalog': '职位目录',

  // memberships
  'org.memberships.title': '成员关系',
  'org.memberships.addTitle': '新增成员关系',
  'org.memberships.listTitle': '有效与历史',
  'org.memberships.makePrimary': '设为主要',
  'org.memberships.endMembership': '结束成员关系',

  // company detail
  'org.company.title': '公司',

  // messages
  'org.msgCompanyCreated': '公司已创建。',
  'org.msgCompanyUpdated': '公司已更新。',
  'org.msgOrganizationCreated': '组织节点已创建。',
  'org.msgOrganizationUpdated': '组织节点已更新。',
  'org.msgOrganizationDeleted': '组织节点已删除。',
  'org.msgPositionCreated': '职位已创建。',
  'org.msgMembershipCreated': '成员关系已创建。',

  // errors
  'org.errLoadCompanies': '无法加载公司列表。',
  'org.errLoadCompany': '无法加载公司。',
  'org.errCreateCompany': '无法创建公司。',
  'org.errUpdateCompany': '无法更新公司。',
  'org.errLoadOrganizations': '无法加载组织架构。',
  'org.errCreateOrganization': '无法创建组织节点。',
  'org.errUpdateOrganization': '无法更新组织节点。',
  'org.errDeleteOrganization': '无法删除组织节点。',
  'org.errLoadPositions': '无法加载职位列表。',
  'org.errCreatePosition': '无法创建职位。',
  'org.errUpdatePosition': '无法更新职位。',
  'org.errLoadMemberships': '无法加载成员关系。',
  'org.errCreateMembership': '无法创建成员关系。',
  'org.errEndMembership': '无法结束成员关系。',
  'org.errUpdateMembership': '无法更新成员关系。',
  'org.companies.empty': '暂无公司。',
  'org.companies.emptyFiltered': '没有符合筛选条件的公司。',
  'org.company.noMembers': '该公司暂无成员。请邀请用户并选择此公司。',
  'org.organization.empty': '暂无组织节点。',
}
