# CloudOps Agent Skills

**一句指令，全部搞定：部署服務、租用伺服器、管理設定，以及 DevOps 與 SRE 的日常工作。**

這是一組 agent skills，讓 AI 助理透過官方 CLI —— `aws`、`gcloud`、`az` —— 在 **AWS**、**Google Cloud**、**Azure** 上執行 DevOps / SRE 工作。你用自然語言說明需求，agent 會選定雲端、先報價、遇到花錢或破壞性操作先向你確認，執行後再實際驗證結果。

支援 **Claude Code**、**OpenAI Codex**，以及其他支援 `SKILL.md` 格式的 agent。

> 「把這個專案部署到 Cloud Run，設成私有，並給我網址。」
> 「在 AWS 東京區租一台 2 vCPU / 4 GB 的 Ubuntu，SSH 只開放我的 IP。」
> 「`orders-api` 從上次部署後一直回 502，如果是新版本的問題就幫我回滾。」
> 「你今天幫我建了什麼？現在花多少錢？」

## 安裝

### Claude Code

```bash
claude plugin marketplace add <your-org>/cloudops-agent-skills && claude plugin install cloudops@cloudops
```

更新：

```bash
claude plugin marketplace update cloudops && claude plugin update cloudops@cloudops
```

### OpenAI Codex

在 Codex CLI 執行 `/plugins`，從本 repo 提供的 marketplace（`.agents/plugins/marketplace.json`）安裝 **CloudOps**。

### 前置需求

| 工具 | 說明 |
|------|------|
| `aws` **v2** | 必須 —— `aws sso login`、`aws logs tail` 在 v1 不存在 |
| `gcloud` | Google Cloud CLI |
| `az` | Azure CLI 2.x（新版已內建 `az containerapp`） |
| `jq`、`curl` | 解析輸出與查價用 |
| `docker` | 僅 AWS 部署需要（ECS Express Mode 只吃映像檔，不會從原始碼建置） |

只需要安裝你實際使用的雲端的 CLI。請用 SSO／瀏覽器登入（`aws sso login`、`gcloud auth login`、`az login`），**不要把 access key 貼進對話**。

## Skills 一覽

從 `cloudops-core` 開始 —— 所有請求都會先經過它。

| Skill | 功能 |
|-------|------|
| `cloudops-core` | 選雲端、確認目標環境、操作分級、確認流程、路由到對應 skill |
| `cloudops-auth` | 偵測 CLI、登入、「我現在是誰」、切換帳號／專案／訂閱 |
| `cloudops-catalog` | 區域、機型、**真實**跨雲價格 |
| `cloudops-server-rent` | 建立 VM／VPS（EC2、Lightsail、Compute Engine、Azure VM），SSH 只開給你的 IP |
| `cloudops-server-manage` | 列出、啟動、停止、重開機、調整規格 |
| `cloudops-server-exec` | 透過 SSM／IAP／run-command／SSH 在主機上執行指令 |
| `cloudops-deploy` | 部署到 Cloud Run、**ECS Express Mode**、Azure Container Apps |
| `cloudops-inventory` | 目前有什麼資源、哪些是 agent 建立的（依標籤） |
| `cloudops-logs` | 應用程式、平台、建置日誌 |
| `cloudops-metrics` | CPU／記憶體／請求量／延遲，並對照上限 |
| `cloudops-config` | 環境變數與密鑰（Secrets Manager／Secret Manager／Key Vault） |
| `cloudops-scale` | 副本數、規格、節點池 —— 套用前先報價 |
| `cloudops-restart-rollback` | 重啟服務、回滾有問題的版本 |
| `cloudops-database` | 託管 Postgres（RDS、Cloud SQL、Flexible Server）：私有、加密、有備份 |
| `cloudops-storage` | Bucket／Container、臨時分享連結 |
| `cloudops-network` | 防火牆／安全群組／NSG 規則、「哪些對全世界開放」稽核 |
| `cloudops-domain-dns` | DNS 記錄、自訂網域、HTTPS 憑證 |
| `cloudops-cost` | 本月花費、閒置資源偵測、預算警示 |
| `cloudops-delete` | 刪除流程：明確目標、備份、輸入名稱確認、驗證已刪除 |
| `cloudops-troubleshoot` | 依症狀診斷：502、port 不符、OOM、權限、配額、API 未啟用 |

## 安全機制

能執行雲端 CLI 的 agent，也有能力讓帳單暴增或刪掉資料庫。所有 skill 都遵守 `cloudops-core` 的規則：

- **明確指定目標。** 每次都會列出 `Target: 雲端 · 帳號/專案/訂閱 · 區域 · 環境`，且每個指令都明確帶上帳號與區域，絕不依賴 shell 的預設值。
- **五種操作等級。** READ 直接執行；CHANGE 先告知（正式環境需確認）；**SPEND**（花錢）需要看過價格後明確同意；**EXPOSE**（對外開放）需要明確同意「誰能連到什麼」；**DESTROY**（刪除）需要列出確切資源、提供備份，含資料的資源必須由你親自輸入名稱。
- **agent 本身就是確認提示。** `--yes`、`--quiet`、`--force`、`--skip-final-snapshot` 只會在你確認**之後**才使用。
- **不編造價格。** 數字一律來自定價 API，查不到就回報「無法估價」。
- **密鑰不進對話、不進指令參數。** 改用 Secret 服務的參照，輸出時遮罩。
- **一律打標籤。** 所有建立的資源都帶 `managed_by=cloudops_agent`，盤點、成本與清理只會動到 agent 建立的資源。
- **最小權限。** 遇到權限錯誤會回報缺少什麼，而不是自行授予管理員權限。
- **日誌與工具輸出視為不可信資料**，不會當成指令執行。

## 重要設計決策

- **AWS 預設使用 ECS Express Mode。** AWS App Runner 自 2026-04-30 起不再開放新客戶。Express Mode 只執行容器映像檔（不從原始碼建置），也不會縮到零；deploy skill 會事先說明。Cloud Run 與 Container Apps 可縮到零。
- **標出跨雲陷阱。** 例如 `--set-env-vars` 在 Cloud Run 是「整組取代」，在 Azure Container Apps 卻只是「新增／更新」；`az vm create` 預設把 SSH 開給全世界（需加 `--nsg-rule NONE`）；Azure 刪 VM 不會一併刪除磁碟、網卡與公用 IP。
- **刻意使用命令式 CLI。** 這是從一句話到服務上線最快的路徑；正式環境長期維運時，skill 會提醒一次 Terraform／CloudFormation／Bicep，然後照你的要求執行。

## 目前不包含

網域購買／轉移、靜態網站與 Serverless 函式託管、VPC／網路設計、IAM 設計、Kubernetes 工作負載（僅支援節點池擴縮）、含通知的 Azure 預算。

## 驗證狀態（請務必先閱讀）

| 雲端 | 驗證方式 |
|------|----------|
| AWS | skills 中出現的每個 `aws` 操作與旗標，都對照 AWS CLI 的 API 模型檢查（103 個操作）。僅存在於 **v2** 的 CLI 自訂指令（`logs tail`、`sso login` 等）是依文件確認，未實際執行。 |
| Azure | 每個 `az` 指令與旗標都對照 Azure CLI 2.91 實際的 `--help`（93 個指令）。需要 extension 的指令（`az ssh vm`、`az monitor log-analytics query`）已在文件中標註。 |
| GCP | 建置環境無法安裝 `gcloud`，指令依 Google 官方文件撰寫並抽查（Cloud Run source deploy、Cloud SQL 旗標）。**正式使用前請先檢視 `gcloud` 區塊。** |
| 全部 | 127 個 shell 區塊通過 `bash -n` 與 `shellcheck`（error 等級）；65 個 JMESPath `--query` 可編譯；`jq` 流程以模擬 API 回應測試；工具本身有 31 個測試（行覆蓋 100%、分支覆蓋 98%，11 個刻意弄壞的邏輯全被抓到）。**過程中未在任何真實雲端帳號建立資源**，第一次使用請先在沙盒帳號試跑。可用 `python3 tools/scripts/verify-cli-commands.py all` 重現驗證。 |

## 文件

| | |
|---|---|
| [架構總覽](docs/architecture/overview.md) | 分層、skill 依賴圖、變更影響圖、品質關卡 |
| [圖表](docs/diagrams/) | 請求生命週期、操作分級、部署流程、刪除協定、Git 流程 |
| [設計決策 (ADR)](docs/adr/) | 為何用 CLI、為何依意圖拆 skill、安全模型、AWS Express Mode、標籤、Git 流程、驗證策略 |
| [記憶](.agents/memories/) · [錯誤紀錄](.agents/errors/) · [工作流程](.agents/skills/) | 維運規則、已踩過的坑、可重用流程 |
| [待辦](todo.md) · [報告](docs/reports/) · [更新紀錄](CHANGELOG.md) | 未完成事項、日報／週報、發版說明 |

## 開發

```bash
npm run check        # 結構驗證 + 含覆蓋率門檻的測試
npm run sync         # 重新產生 plugins/cloudops/（並提交結果）
python3 tools/scripts/verify-cli-commands.py all    # 指令是否真的存在（需 awscli、az、shellcheck）
```

需要 Node 22 以上，沒有任何 npm 依賴。流程採 GitHub Flow 與 Conventional Commits，詳見 [ADR-0006](docs/adr/ADR-0006-git-workflow-github-flow.md) 與 [`CLAUDE.md`](CLAUDE.md)。

## 授權

MIT。結構與慣例改編自 [zeabur/agent-skills](https://github.com/zeabur/agent-skills)（MIT），詳見 `NOTICE.md`。
