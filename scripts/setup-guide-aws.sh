#!/usr/bin/env bash
# One-time AWS setup so the hosted Strip guide (Vercel) can call Kimi K2.5 — with NO access keys anywhere.
# Creates:
#   1. IAM OIDC identity provider  oidc.vercel.com/insanprihatin   (trusts Vercel tokens for this team only)
#   2. IAM role  campus-companion-vercel-guide   assumable ONLY by project "campus-companion", environment "production"
#   3. Inline policy allowing ONLY  bedrock:InvokeModel  on  moonshotai.kimi-k2.5  in us-east-1
# Undo:  bash scripts/setup-guide-aws.sh --remove
set -euo pipefail
AWS="${AWS_CLI:-$HOME/.local/aws-cli/aws} --profile ${AWS_PROFILE_NAME:-campus-companion}"
TEAM=insanprihatin; PROJECT=campus-companion; ROLE=campus-companion-vercel-guide
ACCT=$($AWS sts get-caller-identity --query Account --output text)
PROVIDER_ARN="arn:aws:iam::$ACCT:oidc-provider/oidc.vercel.com/$TEAM"

if [ "${1:-}" = "--remove" ]; then
  $AWS iam delete-role-policy --role-name $ROLE --policy-name kimi-k2-5-invoke-only 2>/dev/null || true
  $AWS iam delete-role --role-name $ROLE 2>/dev/null || true
  $AWS iam delete-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" 2>/dev/null || true
  echo "Removed the guide's AWS access. The hosted guide will show 'unavailable'."; exit 0
fi

echo "This will create, in AWS account $ACCT:"
echo "  • OIDC provider for https://oidc.vercel.com/$TEAM"
echo "  • Role $ROLE (only Vercel project '$PROJECT', production)"
echo "  • Permission: bedrock:InvokeModel on moonshotai.kimi-k2.5 (us-east-1) — nothing else"
read -r -p "Continue? [y/N] " ok; [ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled."; exit 1; }

if ! $AWS iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  $AWS iam create-open-id-connect-provider --url "https://oidc.vercel.com/$TEAM" --client-id-list "https://vercel.com/$TEAM" --tags Key=app,Value=$PROJECT >/dev/null
fi
TRUST=$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"$PROVIDER_ARN"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"oidc.vercel.com/$TEAM:aud":"https://vercel.com/$TEAM","oidc.vercel.com/$TEAM:sub":"owner:$TEAM:project:$PROJECT:environment:production"}}}]}
EOF
)
if $AWS iam get-role --role-name $ROLE >/dev/null 2>&1; then
  $AWS iam update-assume-role-policy --role-name $ROLE --policy-document "$TRUST"
else
  $AWS iam create-role --role-name $ROLE --max-session-duration 3600 --tags Key=app,Value=$PROJECT \
    --description "Vercel production ($PROJECT) may call Kimi K2.5 on Bedrock only" --assume-role-policy-document "$TRUST" >/dev/null
fi
$AWS iam put-role-policy --role-name $ROLE --policy-name kimi-k2-5-invoke-only --policy-document \
  '{"Version":"2012-10-17","Statement":[{"Sid":"KimiOnly","Effect":"Allow","Action":"bedrock:InvokeModel","Resource":"arn:aws:bedrock:us-east-1::foundation-model/moonshotai.kimi-k2.5"}]}'
echo "✅ Done. Go back to Claude and say \"done\"."
