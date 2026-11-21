#!/usr/bin/env bash
# 朝ご飯会 受付アプリを GCP（Cloud Run + Cloud SQL for PostgreSQL）に構築・デプロイする。
# 課金が発生するリソースを作るため、人が手で実行する（Claude は実行しない）。
#
# 使い方（app/ ディレクトリで実行）:
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX ADMIN_EMAILS=a@example.com,b@example.com ./deploy/gcp.sh setup
#   ./deploy/gcp.sh deploy                 # コードを更新したとき
#   ./deploy/gcp.sh set-client-id <ID>     # Google ログインの OAuth クライアント ID を設定
#   ./deploy/gcp.sh set-admins a@x,b@y     # 管理者のメールを変更
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=.deploy-config
REGION=${REGION:-asia-northeast1}
SERVICE=choko-checkin
INSTANCE=choko-db
DB_NAME=choko
DB_USER=app
[ -f "$CONFIG" ] && source "$CONFIG"

save_config() {
  cat > "$CONFIG" <<CFG
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ADMIN_EMAILS=${ADMIN_EMAILS:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
CFG
}

deploy() {
  local conn="$PROJECT_ID:$REGION:$INSTANCE"
  gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --source . \
    --allow-unauthenticated \
    --add-cloudsql-instances "$conn" \
    --set-secrets "DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest" \
    --set-env-vars "^;^ADMIN_EMAILS=${ADMIN_EMAILS:-};GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
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
    deploy
    ;;
  set-client-id)
    : "${PROJECT_ID:?先に setup を実行してください}"
    GOOGLE_CLIENT_ID=${2:?クライアント ID を指定してください}
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
