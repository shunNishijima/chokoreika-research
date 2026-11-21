#!/usr/bin/env bash
# 朝ご飯会 受付アプリを GCP（Cloud Run + Cloud SQL for PostgreSQL）に構築・デプロイする。
# 課金が発生するリソースを作るため、人が手で実行する（Claude は実行しない）。
#
# 使い方（app/ ディレクトリで実行）:
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX ADMIN_EMAILS=a@example.com,b@example.com ./deploy/gcp.sh setup
#   ./deploy/gcp.sh deploy                 # コードを更新したとき
#   ./deploy/gcp.sh set-client-id <ID>     # Google ログインの OAuth クライアント ID を設定
#   ./deploy/gcp.sh set-admins a@x,b@y     # 管理者のメールを変更
#   ADMIN_AUTH=none ./deploy/gcp.sh deploy # 管理画面を認証なしにする（URL を知っていれば誰でも見られる）
#   ./deploy/gcp.sh deploy-reception       # 旧試作（reception/、データは端末内）を別サービスとして公開
#   ./deploy/gcp.sh setup-cd               # GitHub の main に push したら自動デプロイ（鍵なしの Workload Identity 連携）
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=.deploy-config
REGION=${REGION:-asia-northeast1}
SERVICE=choko-checkin
INSTANCE=choko-db
DB_NAME=choko
DB_USER=app
# コマンドで渡した ADMIN_AUTH を、保存済みの設定より優先する
_ADMIN_AUTH_ENV=${ADMIN_AUTH-__unset__}
[ -f "$CONFIG" ] && source "$CONFIG"
[ "$_ADMIN_AUTH_ENV" != "__unset__" ] && ADMIN_AUTH=$_ADMIN_AUTH_ENV

# 作成直後のサービスアカウントは数十秒認識されないことがあるため、失敗したら待ってやり直す
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ "$n" -ge 6 ] && return 1
    echo "  ...反映待ち（${n}回目、10秒後にやり直します）" >&2
    sleep 10
  done
}

save_config() {
  cat > "$CONFIG" <<CFG
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ADMIN_EMAILS=${ADMIN_EMAILS:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
ADMIN_AUTH=${ADMIN_AUTH:-}
CFG
}

deploy() {
  local conn="$PROJECT_ID:$REGION:$INSTANCE"
  gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --source . \
    --allow-unauthenticated \
    --add-cloudsql-instances "$conn" \
    --set-secrets "DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest" \
    --set-env-vars "^;^ADMIN_EMAILS=${ADMIN_EMAILS:-};GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-};ADMIN_AUTH=${ADMIN_AUTH:-}" \
    --min-instances 0 --max-instances 2 --memory 512Mi --quiet
  local url
  url=$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')
  echo
  echo "公開URL: $url"
  echo "管理画面: $url/admin"
}

case "${1:-}" in
  setup)
    : "${BILLING_ACCOUNT:?BILLING_ACCOUNT を指定してください（gcloud billing accounts list で確認）}"
    : "${ADMIN_EMAILS:?ADMIN_EMAILS（管理者の Google アカウントのメール、カンマ区切り）を指定してください}"
    PROJECT_ID=${PROJECT_ID:-chokoreika-app-$(openssl rand -hex 3)}
    save_config
    echo "== プロジェクト $PROJECT_ID を作成"
    gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 || gcloud projects create "$PROJECT_ID" --name "chokoreika app"
    gcloud billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT"
    echo "== API を有効化"
    gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
      cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"
    echo "== Cloud SQL（PostgreSQL）を作成（数分かかります）"
    if ! gcloud sql instances describe "$INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
      gcloud sql instances create "$INSTANCE" --project "$PROJECT_ID" --region "$REGION" \
        --database-version POSTGRES_16 --edition enterprise --tier db-f1-micro \
        --storage-size 10 --storage-auto-increase
    fi
    gcloud sql databases describe "$DB_NAME" --instance "$INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1 || \
      gcloud sql databases create "$DB_NAME" --instance "$INSTANCE" --project "$PROJECT_ID"
    echo "== DB ユーザーと秘密情報（Secret Manager に保存し、画面には出しません）"
    if ! gcloud secrets describe database-url --project "$PROJECT_ID" >/dev/null 2>&1; then
      DB_PASS=$(openssl rand -hex 24)
      gcloud sql users create "$DB_USER" --instance "$INSTANCE" --project "$PROJECT_ID" --password "$DB_PASS" >/dev/null
      printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s:%s:%s' "$DB_USER" "$DB_PASS" "$DB_NAME" "$PROJECT_ID" "$REGION" "$INSTANCE" | \
        gcloud secrets create database-url --project "$PROJECT_ID" --data-file=- >/dev/null
      unset DB_PASS
    fi
    gcloud secrets describe session-secret --project "$PROJECT_ID" >/dev/null 2>&1 || \
      openssl rand -hex 32 | tr -d '\n' | gcloud secrets create session-secret --project "$PROJECT_ID" --data-file=- >/dev/null
    echo "== 実行用サービスアカウントに権限を付与"
    PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
    SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
    for role in roles/secretmanager.secretAccessor roles/cloudsql.client roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/storage.admin roles/logging.logWriter; do
      gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" --role "$role" --condition None >/dev/null
    done
    echo "== デプロイ"
    deploy
    echo
    echo "次の手順: Google ログイン用の OAuth クライアント ID を作り、./deploy/gcp.sh set-client-id <ID> を実行してください。"
    echo "  https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    ;;
  deploy)
    : "${PROJECT_ID:?先に setup を実行してください}"
    save_config
    deploy
    ;;
  deploy-reception)
    : "${PROJECT_ID:?先に setup を実行してください}"
    gcloud run deploy choko-reception --project "$PROJECT_ID" --region "$REGION" --source ../reception \
      --allow-unauthenticated --port 8080 --min-instances 0 --max-instances 2 --memory 256Mi --quiet
    echo
    echo "旧試作の公開URL: $(gcloud run services describe choko-reception --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
    ;;
  setup-cd)
    : "${PROJECT_ID:?先に setup を実行してください}"
    REPO=${REPO:-shunNishijima/chokoreika-research}
    PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
    DEPLOY_SA="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"
    RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
    echo "== API を有効化"
    gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"
    echo "== デプロイ専用のサービスアカウント"
    gcloud iam service-accounts describe "$DEPLOY_SA" --project "$PROJECT_ID" >/dev/null 2>&1 || \
      gcloud iam service-accounts create github-deployer --project "$PROJECT_ID" --display-name "GitHub Actions deployer"
    for role in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin roles/artifactregistry.writer roles/serviceusage.serviceUsageConsumer roles/viewer; do
      retry gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" --role "$role" --condition None >/dev/null
    done
    # Cloud Run の実行用アカウントとしてデプロイできるようにする
    retry gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project "$PROJECT_ID" \
      --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null
    echo "== Workload Identity 連携（$REPO の main ブランチだけを許可）"
    gcloud iam workload-identity-pools describe github --location global --project "$PROJECT_ID" >/dev/null 2>&1 || \
      gcloud iam workload-identity-pools create github --location global --project "$PROJECT_ID" --display-name "GitHub Actions"
    gcloud iam workload-identity-pools providers describe github-repo --workload-identity-pool github --location global --project "$PROJECT_ID" >/dev/null 2>&1 || \
      gcloud iam workload-identity-pools providers create-oidc github-repo --workload-identity-pool github --location global --project "$PROJECT_ID" \
        --issuer-uri "https://token.actions.githubusercontent.com" \
        --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
        --attribute-condition "assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
    retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
      --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null
    echo "== GitHub のリポジトリ変数を設定（秘密情報ではない）"
    gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT_ID"
    gh variable set GCP_REGION --repo "$REPO" --body "$REGION"
    gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$DEPLOY_SA"
    gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-repo"
    echo
    echo "完了: 以後 main に push すると、テストが通れば自動でデプロイされます。"
    echo "進み具合: https://github.com/$REPO/actions"
    ;;
  set-client-id)
    : "${PROJECT_ID:?先に setup を実行してください}"
    GOOGLE_CLIENT_ID=${2:?クライアント ID を指定してください}
    if [[ ! "$GOOGLE_CLIENT_ID" =~ ^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$ ]]; then
      echo "クライアント ID の形式ではありません（例: 123456789-abc123.apps.googleusercontent.com）。GCP コンソールの「Google Auth Platform > クライアント」で作成した ID を指定してください。" >&2
      exit 1
    fi
    save_config
    gcloud run services update "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --update-env-vars "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" --quiet
    ;;
  set-admins)
    : "${PROJECT_ID:?先に setup を実行してください}"
    ADMIN_EMAILS=${2:?メールをカンマ区切りで指定してください}
    save_config
    gcloud run services update "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --update-env-vars "^;^ADMIN_EMAILS=$ADMIN_EMAILS" --quiet
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
