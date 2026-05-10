# 戻ってからの確認手順 (Handoff)

このドキュメントは autonomous run で残した gap について、**戻ってきたあなたが何を / どういう順番で確認・実行するか** をまとめたもの。
sandbox から触れなかった部分の検証 + 残作業の進め方。

優先度は上から順。各セクション独立して実行可能。

---

## ① まず手元で動くことを確認する (5 分)

ローカル環境で全 pipeline が green か。CI と同じことをローカルで再走するだけ。

```bash
git clone https://github.com/n-guitar/yuipath.git
cd yuipath
git config core.hooksPath .githooks

# API
cd apps/api
uv sync --all-extras
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run pytest -q
# 期待: ruff/mypy clean、pytest 26 passed

# Web (リポルート)
cd ../..
pnpm install
pnpm -r typecheck
pnpm -r --filter "@yuipath/web" test
pnpm exec biome check apps/web/src packages
# 期待: typecheck OK、vitest 2 passed、biome clean

# Infra
pnpm --filter "@yuipath/cdk" synth
# 期待: 4 NestedStacks の CloudFormation YAML 出力
```

**詰まった場合**: `docs/dev-guide.md` を参照。Node 20 / Python 3.11+ / pnpm 10 / uv 0.8 が要件。

---

## ② docker-compose の smoke test (10 分)

sandbox では port forward 不可で実走できなかった部分。

```bash
docker-compose up
# 起動するもの:
#   - dynamodb-local      :8001
#   - dynamodb-init       (sidecar、テーブル自動作成して exit)
#   - api                 :8000   (FastAPI + uvicorn --reload)
#   - web                 :5173   (Vite dev server, /api → api:8000)
```

確認:

| URL | 期待 |
|---|---|
| http://localhost:5173 | YuiPath SPA、Projects view が空 list で表示 |
| http://localhost:5173 → "New project name" 入力 → Create | Projects table に 1 行表示 + Tasks view に遷移 |
| Tasks view → "New task name" 入力 → Add task | Tasks table に行追加、status select 動作 |
| Settings nav 押下 | `id: local-user` / `is_system_admin: yes` が表示 (dev mode) |
| Theme picker (sidebar 下部) auto/light/dark | 切替に応じて `<html data-theme>` が変わる |
| http://localhost:8000/healthz | `{"status": "ok"}` |
| http://localhost:8000/docs | Swagger UI で 15 endpoint 表示 |
| http://localhost:8001/ (DynamoDB Local) | `{"__type":"...","Message":"..."}` HTTP 400 応答 (これが正常) |

ハマりどころ:
- 初回 `dynamodb-init` 失敗 → DynamoDB Local の起動完了を待たずに走った可能性。`docker-compose restart dynamodb-init` で再試行
- `api` が DynamoDB に繋がらない → `YUIPATH_DYNAMODB_ENDPOINT_URL=http://dynamodb-local:8000` (compose で設定済み) を上書きしていないか確認
- web からの API call が CORS で弾かれる → vite proxy が効いてないことが原因。`apps/web/vite.config.ts` の `server.proxy` を確認

---

## ③ AWS dev account へのデプロイ試走 (30 分〜数時間)

CDK は synth まで通したが、**実 deploy で必ず最初の 1〜2 回はハマる**。要 AWS account + IAM admin。

### 事前準備

```bash
aws configure                 # AWS CLI 認証 (任意の方法)
cd infra/cdk
pnpm install
pnpm exec cdk bootstrap aws://<ACCOUNT_ID>/us-east-1   # アカウント x リージョンに 1 度だけ
```

### 初回デプロイ

```bash
pnpm exec tsx scripts/setup-env.ts --env dev
# 対話で callbackUrl 確認 (デフォルト: http://localhost:5173/auth/callback)
# CDK deploy が走る (10〜15 分、Lambda image を ECR に push する分長い)
```

期待される出力:

```
Outputs:
  YuiPathStack-dev.AuthStackXXX.UserPoolId         = us-east-1_xxxxxxxxx
  YuiPathStack-dev.AuthStackXXX.WebClientId        = xxxxxxxxxxxxxxxxxxxxxxx
  YuiPathStack-dev.AuthStackXXX.HostedUiUrl        = https://yuipath-dev.auth.us-east-1.amazoncognito.com
  YuiPathStack-dev.DataStackXXX.TableName          = yuipath-dev
  YuiPathStack-dev.ApiStackXXX.ApiEndpoint         = https://xxxxx.execute-api.us-east-1.amazonaws.com
  YuiPathStack-dev.WebStackXXX.DistributionDomain  = xxxxxxxxxxxxx.cloudfront.net
  YuiPathStack-dev.WebStackXXX.WebBucketName       = yuipath-dev-web-<account>
```

### 想定ハマりどころ

1. **Docker daemon 必要**: `lambda.DockerImageCode.fromImageAsset` が `apps/api/Dockerfile.lambda` をビルド。Docker Desktop 起動を忘れがち。
2. **ECR repo 自動作成の権限**: CDK bootstrap で付与されている前提だが、IAM 制限の厳しい環境では別途権限が要る。
3. **CloudFront WAF は us-east-1 必須**: `WebStack` の WAF は scope=CLOUDFRONT なので region 強制。他 region に deploy したい場合は WAF を別 stack に切る必要あり。
4. **Cognito Hosted UI domain prefix の重複**: `yuipath-dev` が既に世界のどこかで使われていると失敗。`infra/cdk/lib/auth-stack.ts` で suffix (例: account 末尾 4 桁) を足して再 deploy。
5. **`/healthz` の挙動**: `curl https://<endpoint>/healthz` で 200 が返ることを確認 (HttpNoneAuthorizer で auth bypass)。

### Web bundle の upload (まだスクリプトに wired してない)

setup-env.ts の最後に「次のステップ」として案内が出る。手動実行:

```bash
cd apps/web
VITE_BUILD_ENV=dev pnpm build
aws s3 sync dist/ s3://yuipath-dev-web-<account>/ --delete
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

CloudFront URL を開いて SPA が出たら成功。ただし auth がまだなので Settings タブを開くと 401 (次節)。

### .env が web に行ってない

`setup-env.ts` は `apps/web/.env.dev` に必要な値を出力する。Vite はビルド時に `import.meta.env.VITE_*` として参照するので、build 前に env が揃っている必要がある。`apps/web/src/api/client.ts` 等は `VITE_API_BASE` をまだ参照していない (現状は同一オリジン前提)。**SPA を CloudFront から配信するなら `VITE_API_BASE = https://<api-endpoint>` を読んで API call を切替えるよう client.ts を修正する必要がある**。これは Cognito 統合と一緒にやる。

---

## ④ Cognito Hosted UI redirect を SPA に組み込む (4〜8 時間、要設計判断)

Backend (`apps/api/src/yuipath_api/auth.py`) は Cognito JWT 受け取り完成。**SPA 側の OAuth code flow + token storage が未実装**。

### 選択肢

| 方法 | pros | cons |
|---|---|---|
| **`oidc-client-ts` + 自前 wiring** | 軽量、依存少、PKCE 自動 | refresh handling を自分で書く必要 |
| **`aws-amplify` の `Auth` module** | 完成度高、Hosted UI 統合の docs 豊富 | バンドル肥大、Amplify 全体の思想に乗る形になる |
| **完全自前 (fetch + history API)** | 制御 100% | state/nonce/PKCE/refresh 全部自分で実装、地雷多い |

**推奨: `oidc-client-ts`**。1 ファイルで wrap できて、Amplify ほど大きくならない。

### 実装ポイント (どこを書き換えるか)

1. `apps/web/src/auth/cognito.ts` を新設:
   - `UserManager` を `VITE_COGNITO_USER_POOL_ID` `VITE_COGNITO_CLIENT_ID` `VITE_COGNITO_HOSTED_UI` で構成
   - `signinRedirect()` `signinRedirectCallback()` `signoutRedirect()` を export
2. `apps/web/src/App.tsx` に auth gate を追加:
   - `/auth/callback` で `signinRedirectCallback()` を呼ぶ
   - 未認証なら `signinRedirect()` (ただし `VITE_AUTH_MODE=dev` ならスキップ)
3. `apps/web/src/api/client.ts` の `apiFetch` 呼び出し全部に `authToken` を渡す:
   ```ts
   const baseUrl = import.meta.env.VITE_API_BASE ?? "";
   const token = await authStore.getAccessToken();
   apiFetch(path, init, { baseUrl, authToken: token });
   ```
4. CORS: API Gateway の `corsAllowOrigins` を CloudFront URL に追加 (現在は callbackUrls から自動派生)。
5. **Backend の `auth_mode` を `dev` から `cognito` に切替**: ApiStack の env で `YUIPATH_AUTH_MODE=cognito` を Lambda に渡す (既に対応済み)。

### 確認

- CloudFront URL を開く
- Cognito Hosted UI にリダイレクト → サインアップ
- callback で SPA に戻る
- Projects 一覧が空で表示される (新規 user)
- Project 作成 → 表示
- DevTools の Network タブで `Authorization: Bearer ...` が付いていることを確認

### 注意

- **system_admin の作り方**: Cognito User Pool には custom attribute `is_system_admin` を定義してある (auth-stack.ts)。AWS console で User → Edit → custom:is_system_admin = true。または `aws cognito-idp admin-update-user-attributes`。
- **MFA**: `docs/security.md` で system_admin に MFA 必須と記載したが、CDK では未強制。Cognito の MFA 設定は手動 / 別 ADR 想定。

---

## ⑤ AgentCore Gateway に OpenAPI を register (1 時間、CDK L2 待ち)

CDK L2 が無いので **AWS Console / Toolkit で手動**。setup-env.ts の最後の案内ステップ。

### 手順

```bash
# OpenAPI spec を生成
cd apps/api
uv run python -c "import json; from yuipath_api.main import app; print(json.dumps(app.openapi()))" > openapi.json
```

AWS Console:
1. Bedrock AgentCore → Gateways → Create gateway
2. Name: `yuipath-dev`
3. Authorizer: Cognito (Auth Stack の UserPool ARN, mcp client を選択)
4. Tools → Add OpenAPI → `apps/api/openapi.json` を upload
5. Backend: API Gateway endpoint (https://xxxxx.execute-api.us-east-1.amazonaws.com)
6. Save → Gateway URL がもらえる (例: `https://yuipath-dev-xxx.gateway.bedrock-agentcore.amazonaws.com/mcp`)

### Claude Desktop に登録

`~/Library/Application Support/Claude/claude_desktop_config.json` (mac):

```json
{
  "mcpServers": {
    "yuipath": {
      "url": "https://yuipath-dev-xxx.gateway.bedrock-agentcore.amazonaws.com/mcp",
      "auth": {
        "type": "oauth",
        "providerUrl": "https://yuipath-dev.auth.us-east-1.amazoncognito.com"
      }
    }
  }
}
```

確認: Claude Desktop で「YuiPath で project を作って」とお願いすると OAuth → Cognito ログイン → tool 一覧表示 → Project 作成成功 が動く。

### CDK L2 が出たら

`infra/cdk/lib/mcp-stack.ts` を新設して `BedrockAgentcoreGateway` construct で wiring。`yuipath-stack.ts` から呼ぶ。手動 step は廃止できる。

---

## ⑥ MonitoringStack の追加 (1〜2 時間)

`docs/ops/monitoring.md` の表をそのまま CDK 化。

### 追加するもの

`infra/cdk/lib/monitoring-stack.ts`:

```typescript
import * as cdk from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";

export interface MonitoringStackProps extends cdk.NestedStackProps {
  envName: string;
  table: dynamodb.Table;
  fn: lambda.IFunction;
  httpApi: apigwv2.HttpApi;
  alarmEmail: string;
}

export class MonitoringStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const topic = new sns.Topic(this, "AlarmTopic");
    topic.addSubscription(new snsSubs.EmailSubscription(props.alarmEmail));

    new cw.Alarm(this, "DDBThrottle", {
      metric: props.table.metric("ThrottledRequests", { statistic: "Sum" }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(new actions.SnsAction(topic));
    // ... Lambda errors / 4xx / 5xx / cf 5xx / cognito throttle (docs/ops/monitoring.md の表参照)
  }
}
```

`yuipath-stack.ts` に追加:

```typescript
new MonitoringStack(this, "MonitoringStack", {
  envName: props.envName,
  table: data.table,
  fn: api.fn,
  httpApi: api.httpApi,
  alarmEmail: props.alarmEmail ?? "you@example.com",
});
```

deploy 後、SNS から確認 email が届くので Confirm subscription を押すこと (押し忘れて alarm が来ない事故が多い)。

---

## ⑦ mock UX の残り view 移植 (本格的、数日〜)

優先順位 (mock 体験で重要な順):

| view | mock の path | 移植難度 | 備考 |
|---|---|---|---|
| **Dashboard** | `mock/project/screens.jsx` | 中 | detector framework (DETECTORS_NOW) を Python (`apps/api/src/yuipath_api/domain/detectors.py` 新設) に移植してから API endpoint で出すのが筋。frontend は受け取って render するだけ |
| **Table** | `mock/project/table.jsx` | 高 | inline edit (Tab/Enter nav)、indent/outdent、行 drag-reorder、CSV import/export。`@tanstack/react-table` ベースで書き直すのが現実的 |
| **Gantt** | `mock/project/gantt.jsx` | 高 | bar drag、phase 折り畳み、依存矢印、critical path。SVG ベース推奨 |
| **Calendar** | `mock/project/calendar.jsx` | 中 | 月 view + task bar lane assignment + holiday hilight |
| **Resources** | `mock/project/screens.jsx` (resources) | 低 | 週次 load histogram + 削除確認 |
| **TaskDrawer** | `mock/project/screens.jsx` (drawer) | 中 | inline edit 全部 + comments + activity scroll-to |
| **ConfirmDialog** | `mock/project/screens.jsx` | 低 | 既に `confirm()` で代用してるが、ちゃんとした modal に置き換え |
| **Auth shell** | `mock/project/auth.jsx` | 低 | Cognito Hosted UI に流すなら不要 |

### 進め方

1. ⑥ MonitoringStack より先に Dashboard をやるのを推奨。理由: detector framework は backend に置く価値が高い (LLM/MCP からも使える)
2. 1 つの view を移植するごとに `apps/web/src/views/` に追加 + `Layout.tsx` の nav button 追加
3. mock の `pw-` CSS を `apps/web/src/theme/` の方に少しずつ持ってくる (mock 自体は触らない)
4. mock との振る舞い差は Chrome DevTools で並べて比較

### 守ること

- **mock を改変しない**。UX spec として凍結 (CLAUDE.md で明示済み)
- **計算ロジックを TS で再実装しない**。working day / critical path / detector は backend に集約 (ADR-0013)
- **EVM/SPI/CPI を入れない**。

---

## ⑧ uv.lock / pnpm-lock.yaml をコミット (5 分、任意)

reproducible build が要るなら:

```bash
pnpm install                          # pnpm-lock
git add pnpm-lock.yaml
cd apps/api && uv lock && cd ../..    # uv.lock
git add apps/api/uv.lock

# CI を frozen に切替 (再現性優先するなら)
# .github/workflows/api.yml: `uv sync --all-extras` → `uv sync --all-extras --frozen`
# .github/workflows/web.yml + infra.yml: `pnpm install` → `pnpm install --frozen-lockfile`
```

---

## ⑨ apps/api/openapi.json を再生成・コミット (1 分、任意)

API contract のスナップショットを git で追える形に:

```bash
cd apps/api
uv run python -c "import json; from yuipath_api.main import app; print(json.dumps(app.openapi(), indent=2))" > openapi.json
cd ../..
pnpm --filter "@yuipath/api-client" generate
git add apps/api/openapi.json packages/api-client/src/schema.ts
```

CI に「openapi.json と schema.ts の drift check」を追加するとよい:

```yaml
# .github/workflows/api.yml の最後に
- name: Verify OpenAPI is up to date
  run: |
    uv run python -c "import json; from yuipath_api.main import app; print(json.dumps(app.openapi(), indent=2))" > openapi.json.new
    diff openapi.json openapi.json.new
```

---

## 終わりに

**ここまでで Phase 0-4 の autonomous run は文字通り「完了」とは呼びたくない**。コードは書いたしテストも通っているが、実際にユーザーに価値が届くのは:

- AWS で deploy できて
- Cognito でログインできて
- Claude Desktop から MCP で操作できて
- mock 並みの view が揃った

時。各セクションの所要時間を足すと **おそらく 1〜2 週間 (大きな知らない罠が無ければ)**。一気にやらず、AWS deploy → Cognito 統合 → Dashboard 移植 → MonitoringStack の順でやるのが摩擦少なめ。

何か詰まったら issue #10 (Design v2 トラッカー) にコメントするか、本ドキュメントを更新してください。
