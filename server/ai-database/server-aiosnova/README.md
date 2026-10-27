# 共享开发库 aiosnova：AI 初次建表

状态：仅准备文件，尚未执行数据库变更。目标为 MySQL 8.4 中现有的 `aiosnova` 数据库。

## 文件与范围

- `01_precheck_readonly.sql`：执行前只读检查，检查数据库身份、权限、目标表和约束名冲突，并列出现有表。
- `02_create_ai_tables.sql`：合并原 001～009 的最终结构，仅执行 `USE aiosnova` 和14条完整限定数据库名的 `CREATE TABLE`。
- `03_postcheck_readonly.sql`：执行后只读检查，检查表、必需字段、字段类型/默认值、索引、外键、CHECK 约束、精确行数和完整建表定义。

不创建数据库，不修改现有表，不授权，不导入本地或 Mock 数据。原 001～009 文件保持不变。不要对共享库直接执行旧脚本。

008 的9个 Provider 验证字段及 CHECK、009 的目录 Context 字段及 CHECK 已放入初次建表定义。007 对 Skills 和 Data Sources 增加的两个复合唯一索引也已放入对应建表定义，因此不需要再执行这些 ALTER。

所有表显式使用 InnoDB、utf8mb4 和 utf8mb4_0900_ai_ci；原有标识字段继续使用 ascii/ascii_bin。13个外键均只引用本脚本内的新 AI 表，父表先创建。保留原设计：Agent 模型引用及默认模型引用没有新增外键，Agent 知识库绑定也没有新增到知识库的外键，由 Service 校验。

## 第一步：现在可执行的只读检查

保持 SSH tunnel 开启，使用已确认的服务器 MySQL 连接。在 `mysql>` 中执行：

```sql
SOURCE C:/Users/mings/aiosnova/server/ai-database/server-aiosnova/01_precheck_readonly.sql;
```

检查结果应满足：

1. 当前数据库是 aiosnova，服务器身份与团队提供的信息一致，版本为 MySQL 8.4。
2. 目标库存在，账号有建表所需权限。
3. 14个目标表全部为 ABSENT。
4. 约束名冲突查询返回零行。
5. 保存现有表清单，供执行后对比。

只要出现 STOP_EXISTS、约束冲突、查询失败或服务器身份不符，就停止并检查，不能继续建表。

## 第二步：团队审核后才执行建表

当前请求没有授权执行此步骤。先确认共享库备份/恢复安排，与团队约定变更时间，并暂停连接该库的本机 AI 后端，避免验收期间写入数据。执行前重新运行只读预检，避免使用过期结果。

团队批准后，使用能在 SQL 错误时停止的批处理方式执行建表文件；不要使用 mysql 的 --force。交互式 SOURCE 出错后可能继续执行后续语句，不应把它当作遇错即停的部署方式。

建表脚本刻意不使用 IF NOT EXISTS：已存在的表必须先核对结构，不能静默跳过。MySQL DDL 会隐式提交，整个14张表的建表过程不是一个可统一回滚的事务。若中途失败，保留错误及已建表清单，先检查部分完成状态；不要盲目重跑，也不要自动删除已建表。

## 第三步：执行后只读验收

仅在建表获批并执行后，在同一个已确认的 MySQL 连接运行：

```sql
SOURCE C:/Users/mings/aiosnova/server/ai-database/server-aiosnova/03_postcheck_readonly.sql;
```

预期14张表均 PASS，缺失字段查询零行；在没有应用写入时，14张表行数均为0。字段存在并不代表类型、默认值、索引和约束全部正确，须继续将详细元数据及 SHOW CREATE TABLE 输出与建表脚本比较。与预检清单对比，原有业务表应仍在，仅增加14张目标表。

本次只完成数据库结构准备。不会迁移本地 Provider、模型、Agent、Knowledge 或 Template 数据，也不会验证真实模型调用、文件迁移或生产认证/公司权限集成。
