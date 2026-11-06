#!/usr/bin/env bash
# Automatic spending brake for the hosted Strip guide.
# When the "campus-companion-monthly-50usd" AWS Budget reaches 100% ($50 actual), AWS Budgets automatically attaches a
# deny-all-Bedrock policy to the guide's role, so the live site stops calling the model. Other AWS usage is untouched.
# Creates: policy campus-companion-guide-deny-bedrock, role campus-companion-budget-action (usable only by AWS Budgets
# in this account, and only to attach/detach that one policy on the guide role), and the budget action.
# Re-enable after a brake:  aws iam detach-role-policy --role-name campus-companion-vercel-guide --policy-arn <deny policy arn>
# Remove:  bash scripts/setup-budget-brake.sh --remove
set -euo pipefail
AWS="${AWS_CLI:-$HOME/.local/aws-cli/aws} --profile ${AWS_PROFILE_NAME:-campus-companion}"
BUDGET=campus-companion-monthly-50usd; GUIDE_ROLE=campus-companion-vercel-guide; EXEC_ROLE=campus-companion-budget-action; POLICY=campus-companion-guide-deny-bedrock
ACCT=$($AWS sts get-caller-identity --query Account --output text)
DENY_ARN="arn:aws:iam::$ACCT:policy/$POLICY"

if [ "${1:-}" = "--remove" ]; then
  for id in $($AWS budgets describe-budget-actions-for-budget --account-id "$ACCT" --budget-name $BUDGET --region us-east-1 --query 'Actions[].ActionId' --output text 2>/dev/null); do
    $AWS budgets delete-budget-action --account-id "$ACCT" --budget-name $BUDGET --action-id "$id" --region us-east-1 >/dev/null; done
  $AWS iam detach-role-policy --role-name $GUIDE_ROLE --policy-arn "$DENY_ARN" 2>/dev/null || true
  $AWS iam delete-role-policy --role-name $EXEC_ROLE --policy-name attach-deny-to-guide-only 2>/dev/null || true
  $AWS iam delete-role --role-name $EXEC_ROLE 2>/dev/null || true
  $AWS iam delete-policy --policy-arn "$DENY_ARN" 2>/dev/null || true
  echo "Removed the budget brake (the budget and its email alerts remain)."; exit 0
fi

echo "In AWS account $ACCT this will create an automatic brake on budget '$BUDGET':"
echo "  • at 100% (\$50 actual this month) AWS attaches a deny-Bedrock policy to role $GUIDE_ROLE"
echo "  • a role that only AWS Budgets can use, only to attach/detach that one policy on that one role"
read -r -p "Continue? [y/N] " ok; [ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled."; exit 1; }

$AWS iam get-policy --policy-arn "$DENY_ARN" >/dev/null 2>&1 || $AWS iam create-policy --policy-name $POLICY \
  --description "Applied by AWS Budgets at 50 USD: stops the hosted guide calling Bedrock" \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"bedrock:*","Resource":"*"}]}' >/dev/null
$AWS iam get-role --role-name $EXEC_ROLE >/dev/null 2>&1 || $AWS iam create-role --role-name $EXEC_ROLE \
  --description "Lets AWS Budgets attach the deny-Bedrock policy to the guide role" \
  --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"budgets.amazonaws.com\"},\"Action\":\"sts:AssumeRole\",\"Condition\":{\"StringEquals\":{\"aws:SourceAccount\":\"$ACCT\"}}}]}" >/dev/null
$AWS iam put-role-policy --role-name $EXEC_ROLE --policy-name attach-deny-to-guide-only --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"iam:AttachRolePolicy\",\"iam:DetachRolePolicy\"],\"Resource\":\"arn:aws:iam::$ACCT:role/$GUIDE_ROLE\",\"Condition\":{\"ArnEquals\":{\"iam:PolicyARN\":\"$DENY_ARN\"}}}]}"
echo "Waiting 15 s for IAM to propagate…"; sleep 15

existing=$($AWS budgets describe-budget-actions-for-budget --account-id "$ACCT" --budget-name $BUDGET --region us-east-1 --query 'length(Actions)' --output text 2>/dev/null || echo 0)
if [ "$existing" = "0" ]; then
  $AWS budgets create-budget-action --account-id "$ACCT" --budget-name $BUDGET --region us-east-1 \
    --notification-type ACTUAL --action-type APPLY_IAM_POLICY --approval-model AUTOMATIC \
    --action-threshold ActionThresholdValue=100,ActionThresholdType=PERCENTAGE \
    --definition "IamActionDefinition={PolicyArn=$DENY_ARN,Roles=[$GUIDE_ROLE]}" \
    --execution-role-arn "arn:aws:iam::$ACCT:role/$EXEC_ROLE" \
    --subscribers SubscriptionType=EMAIL,Address=admin@insanprihatin.org >/dev/null
fi
echo "✅ Brake armed: at \$50 actual spend this month the hosted guide loses Bedrock access automatically."
