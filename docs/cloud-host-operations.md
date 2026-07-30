# quant-auth 香港云主机运维说明

## 用途与实例信息

该云主机用于承载量化学习系统桌面版的账号验证服务，服务标识为 `quant-auth`。

| 项目       | 当前值                                 |
| ---------- | -------------------------------------- |
| 云服务商   | 阿里云                                 |
| 地域       | 中国香港（`cn-hongkong`）              |
| 实例 ID    | `i-j6c0kp5inx82hnn0f75w`               |
| 实例名称   | `iZj6c0kp5inx82hnn0f75wZ`              |
| 实例规格   | `ecs.e-c1m1.large`，2 vCPU、2 GiB 内存 |
| 公网 IPv4  | `47.243.230.223`                       |
| 私网 IPv4  | `172.27.235.84`                        |
| 操作系统   | Alibaba Cloud Linux 3                  |
| 当前内核   | `5.10.134-19.7.1.al8.x86_64`           |
| 系统盘     | 40 GiB ESSD Entry                      |
| 服务根目录 | `/opt/quant-auth`                      |

本机开发环境中的 `.env.cloud.local` 保存同一组基础设施元数据。该文件受 `.gitignore` 保护，不应提交到版本库。

## 服务器目录

```text
/opt/quant-auth/
├── app/       # 应用部署文件
├── backups/   # 本机备份
├── data/      # 持久化数据
├── logs/      # 应用日志
└── secrets/   # 服务器端敏感配置
```

除 `secrets` 外的目录权限应保持为仅管理员及所属组可访问。`/opt/quant-auth/secrets` 应限制为 `root` 访问；其中的敏感文件应使用 `600` 权限。

## 基础服务

当前已安装并设置为开机启动：

- Docker
- Nginx
- Firewalld
- Chronyd

通过阿里云 ECS 云助手执行以下只读命令，可以检查内核和服务状态：

```bash
uname -r
systemctl is-active nginx docker firewalld chronyd
systemctl is-enabled nginx docker firewalld chronyd
firewall-cmd --zone=public --list-all
ss -lntp
```

云助手用于在尚未开放公网管理入口时执行初始化、状态检查和故障诊断。操作前应确认目标地域为中国香港，并核对实例 ID。

## 公网访问安全约束

- 默认拒绝所有公网入站访问；安全组不配置入方向规则。
- 未经明确确认，不开放 SSH（22）、HTTP（80）、HTTPS（443）或数据库端口。
- Nginx 和 SSH 即使在服务器本机监听，也必须同时受到安全组和主机防火墙限制。
- 开放任何端口前，应先确定来源地址、协议、最小端口范围、有效期和回退方式。
- 账号验证服务正式对外发布时，应只开放 HTTPS，并在完成域名、TLS、反向代理和应用安全检查后实施。

## 凭据管理

不得在本文件、源代码或 Git 历史中保存：

- 阿里云登录密码或短信验证码
- 邮箱密码或邮件服务凭据
- SSH 私钥
- 数据库密码
- API 密钥、会话密钥或访问令牌

本机敏感配置仅可写入受 Git 忽略的本地环境文件。服务器端敏感配置应写入 `/opt/quant-auth/secrets` 下权限为 `600` 的专用文件。提交变更前应检查暂存区，确保不存在密码、密钥或令牌。

## 盘点与保守清理

仓库中的脚本分别负责只读盘点和保守清理：

```bash
sudo bash deploy/cloud/scripts/cloud-audit.sh /opt/quant-auth/backups
sudo bash deploy/cloud/scripts/cloud-safe-cleanup.sh
```

执行顺序必须是先盘点、审核输出，再清理。清理脚本只执行以下动作：

- 清理 DNF 缓存。
- 将 journald 同时限制为最近 7 天和最多 100 MB。
- 删除 Docker 悬空镜像及 7 天以前的无引用构建缓存，不删除数据卷。
- 没有 Swap 时创建权限为 `600` 的 1 GiB `/swapfile`。
- 最后重新输出内存、磁盘、Docker、服务和监听端口状态。

Cockpit、Podman/Buildah/Skopeo、编译工具、图形/打印/蓝牙组件不会被脚本自动卸载。只有在盘点确认未被服务依赖，并审核 `dnf remove --assumeno <packages>` 的事务预览后，才可对明确包名执行卸载。禁止执行未审核的 `dnf autoremove`。

清理后验收：

```bash
df -hT /
free -h
systemctl is-active docker nginx firewalld chronyd
systemctl is-enabled docker nginx firewalld chronyd
systemctl --failed
ss -lntup
firewall-cmd --zone=public --list-all
```

系统盘可用空间应不少于 20 GiB，空闲状态 `MemAvailable` 应不少于 1 GiB；如果达不到，不继续部署认证容器。

## 生产部署与密钥

生产部署使用以下固定结构：

```text
/opt/quant-auth/
├── backups/postgres/
├── current -> releases/<release-id>/
├── previous -> releases/<release-id>/
├── incoming/
├── releases/
├── data/postgres/
└── secrets/
```

认证服务只映射到主机回环地址 `127.0.0.1:8787`，PostgreSQL 不映射宿主机端口。发布包只能上传到 `/opt/quant-auth/incoming/`，并由版本化发布脚本解压、构建、切换软链接和执行幂等迁移：

```bash
sudo bash /opt/quant-auth/incoming/deploy-release.sh \
  /opt/quant-auth/incoming/quant-auth-<release-id>.tar.gz \
  <release-id>
```

首次部署前，将阿里云邮件推送控制台配置的 SMTP 密码写入权限为 `600` 的 `/opt/quant-auth/secrets/smtp.password`。发布脚本发现生产环境文件不存在时，会自动调用 `bootstrap-production-secrets.sh`，在服务器本机生成数据库密码、四个独立 pepper/secret 和 Ed25519 密钥，不回显秘密，成功后删除临时 SMTP 密码文件。`auth.env` 和 `postgres.env` 已存在时脚本拒绝覆盖，密钥轮换必须采用单独审核的维护流程。

数据库目录的所有权由镜像内的 `postgres` 用户设置，不在宿主机假设固定 UID：

```bash
docker run --rm --user 0 \
  -v /opt/quant-auth/data/postgres:/var/lib/postgresql/data \
  postgres:16-alpine \
  chown -R postgres:postgres /var/lib/postgresql/data
```

公网关闭状态下先验收：

```bash
curl --fail http://127.0.0.1:8787/health/live
curl --fail http://127.0.0.1:8787/health/ready
docker compose -f /opt/quant-auth/current/deploy/cloud/docker-compose.yml ps
docker compose -f /opt/quant-auth/current/deploy/cloud/docker-compose.yml logs --tail=200 auth
```

需要回退时执行：

```bash
sudo /opt/quant-auth/current/deploy/cloud/scripts/rollback-release.sh
```

## DNS、邮件与 TLS

- `fnndp.xyz` 提供静态桌面客户端入口说明。
- `auth.fnndp.xyz` 反向代理到 `127.0.0.1:8787`。
- `notify.fnndp.xyz` 是阿里云邮件推送发信域名。
- 发信地址固定为 `no-reply@notify.fnndp.xyz`，SMTP 使用 `smtpdm.aliyun.com:465` 和 SSL。
- SPF、DKIM、DMARC、MX 只使用邮件推送控制台生成的精确记录值。

DNS-01 使用无控制台登录权限的专用 RAM 用户。真实凭据保存在 `/opt/quant-auth/secrets/acme-ali.env`，权限必须为 `600`，格式参考 `deploy/cloud/acme-ali.example.env`。首次签发及激活：

```bash
sudo /opt/quant-auth/current/deploy/cloud/scripts/issue-tls-certificate.sh
sudo /opt/quant-auth/current/deploy/cloud/scripts/activate-nginx.sh
```

证书只包含 `fnndp.xyz` 和 `auth.fnndp.xyz`。acme.sh 明确使用 Let’s Encrypt、AliDNS API 和 ECC P-256；证书复制到 `/etc/nginx/ssl/fnndp.xyz/`，不直接引用 acme.sh 内部目录。激活 Nginx 后，systemd 每天检查续期并在成功后重载 Nginx。

## 备份、恢复与巡检

- `quant-auth-postgres-backup.timer` 每天 03:30 生成并校验 `pg_dump -Fc`，本机保留 7 天。
- ECS 文件备份基础版设为每天 04:30、低优先级、保留 30 天并至少保留一个版本。
- `quant-auth-restore-drill.timer` 每月第一个星期日恢复最新备份到 `--network none` 的一次性 PostgreSQL 容器并检查核心表。
- `quant-auth-ops-check.timer` 每 5 分钟检查磁盘、可用内存、API、邮件队列、备份新鲜度、证书期限和 Nginx 5xx 比例。
- Docker `json-file` 日志限制为单文件 10 MB、最多 5 个文件；Nginx API访问日志不记录请求体、令牌或验证码。

手动验证：

```bash
sudo systemctl start quant-auth-postgres-backup.service
sudo systemctl start quant-auth-restore-drill.service
sudo systemctl start quant-auth-ops-check.service
systemctl list-timers 'quant-auth-*'
journalctl -u quant-auth-ops-check.service --since today
```

邀请码批量命令应以容器内 root 身份执行，使 CSV 只对 root 可读：

```bash
docker compose -f deploy/cloud/docker-compose.yml exec -u 0 auth \
  node apps/cloud-server/dist/cli/inviteBatchCreate.js \
  --spec "7=20,30=50,90=20,365=10" --claim-days 30
```

命令只输出批次 ID、数量、文件路径和 SHA-256 校验摘要。`quant-auth-invite-exports.conf` 配合 `systemd-tmpfiles --clean` 清理超过 24 小时的明文 CSV。

## 公网 443 开放门槛

以下项目全部完成前，保持安全组无公网入方向规则：

- 真实域名已解析到香港实例。
- SMTP 发件人、SPF/DKIM/DMARC 和收信测试完成。
- TLS 证书已安装，`nginx -t` 通过。
- Nginx 仅反向代理 `127.0.0.1:8787`，PostgreSQL 不监听公网。
- 注册、登录、邀请码、续期、重置密码和会话撤销完成端到端测试。
- 日志确认不包含密码、邮箱验证码、邀请码、登录挑战或令牌。
- 安全组和 Firewalld 只增加 TCP 443；不开放 22、80、5432 或 8787。
- 已记录回退步骤，并完成关闭 443 的演练。

## 当前边界

认证服务代码、数据库迁移、容器配置、版本化发布、备份恢复和运维脚本已经准备。在 DirectMail 发信域名、SMTP 收信测试、TLS 和公网端到端验证完成前不得开放公网 443。PostgreSQL 并发集成测试只能通过专用 `TEST_DATABASE_URL` 执行，禁止指向生产数据库。
