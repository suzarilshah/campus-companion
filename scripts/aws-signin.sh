#!/usr/bin/env bash
# Guided AWS SSO sign-in for Campus Companion's AI features.
# Creates (or reuses) an AWS CLI profile named "campus-companion". No access keys are created, typed or stored here:
# the AWS CLI caches short-lived SSO tokens itself after you approve in the browser.
set -euo pipefail
PROFILE=campus-companion
SESSION=campus-companion
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

bold "Campus Companion · AWS sign-in (SSO)"
echo "You'll approve the sign-in in your browser. Nothing secret is typed here."
echo

current_url=$(awk '/^\[sso-session campus-companion\]/{f=1;next} /^\[/{f=0} f&&/sso_start_url/{print $3}' ~/.aws/config 2>/dev/null || true)
known_url=$(awk '/^\[sso-session /{s=$0} /sso_start_url/{print $3; exit}' ~/.aws/config 2>/dev/null || true)
default_url=${current_url:-$known_url}

echo "1) Your SSO portal link looks like https://d-xxxxxxxxxx.awsapps.com/start"
echo "   (it's the page you open to choose an AWS account)."
read -r -p "   Portal link [${default_url:-none}]: " url
url=${url:-$default_url}
url=${url%%#*}; url=${url%/}
[[ "$url" =~ ^https://[A-Za-z0-9.-]+/start$ ]] || { echo "That doesn't look like an SSO portal link (…/start)."; exit 1; }

default_region=$(awk -v u="$url" '/sso_start_url/{hit=index($3,u)} hit&&/sso_region/{print $3; exit}' ~/.aws/config 2>/dev/null || true)
read -r -p "2) SSO region (where the portal lives) [${default_region:-us-east-1}]: " sso_region
sso_region=${sso_region:-${default_region:-us-east-1}}

python3 - "$SESSION" "$url" "$sso_region" <<'PY'
import sys, re, pathlib
name, url, region = sys.argv[1:]
p = pathlib.Path.home() / '.aws' / 'config'
text = p.read_text() if p.exists() else ''
block = f"[sso-session {name}]\nsso_start_url = {url}\nsso_region = {region}\nsso_registration_scopes = sso:account:access\n"
text = re.sub(rf"\[sso-session {re.escape(name)}\]\n(?:[^\[]*\n)?", '', text)
p.write_text(text.rstrip('\n') + '\n' + block)
PY
aws configure set sso_session "$SESSION" --profile "$PROFILE"

echo
bold "3) A browser tab will open. Check the code matches, then click Allow."
aws sso login --sso-session "$SESSION"

token=$(python3 - "$url" <<'PY'
import json, sys, glob, os
url = sys.argv[1]
best = None
for f in glob.glob(os.path.expanduser('~/.aws/sso/cache/*.json')):
    try: d = json.load(open(f))
    except Exception: continue
    if d.get('accessToken') and d.get('startUrl', '').rstrip('/#').rstrip('/') == url and (not best or d['expiresAt'] > best['expiresAt']): best = d
print(best['accessToken'] if best else '')
PY
)
[ -n "$token" ] || { echo "Could not read the SSO sign-in. Please run this script again."; exit 1; }

echo
bold "4) Choose the AWS account that has your SageMaker endpoint / Bedrock access:"
accounts=(); while IFS= read -r line; do [ -n "$line" ] && accounts+=("$line"); done < <(aws sso list-accounts --access-token "$token" --region "$sso_region" --query 'accountList[].[accountId,accountName]' --output text)
[ "${#accounts[@]}" -gt 0 ] || { echo "This portal shows no accounts for you."; exit 1; }
for i in "${!accounts[@]}"; do printf '   %d) %s\n' "$((i+1))" "${accounts[$i]}"; done
read -r -p "   Number: " pick
account=$(echo "${accounts[$((pick-1))]}" | awk '{print $1}')

roles=(); while IFS= read -r line; do [ -n "$line" ] && roles+=("$line"); done < <(aws sso list-account-roles --access-token "$token" --region "$sso_region" --account-id "$account" --query 'roleList[].roleName' --output text | tr '\t' '\n')
if [ "${#roles[@]}" -eq 1 ]; then role=${roles[0]}; else
  bold "5) Choose a role:"; for i in "${!roles[@]}"; do printf '   %d) %s\n' "$((i+1))" "${roles[$i]}"; done
  read -r -p "   Number: " rpick; role=${roles[$((rpick-1))]}
fi

read -r -p "6) AWS region where your SageMaker endpoint runs [ap-southeast-1]: " region
region=${region:-ap-southeast-1}

aws configure set sso_account_id "$account" --profile "$PROFILE"
aws configure set sso_role_name "$role" --profile "$PROFILE"
aws configure set region "$region" --profile "$PROFILE"
aws configure set output json --profile "$PROFILE"

echo
aws sts get-caller-identity --profile "$PROFILE" --query '{Account:Account,Role:Arn}' --output table
echo
bold "✅ Signed in. Profile: $PROFILE · region: $region"
echo "Go back to Claude and say \"done\" — it will finish the setup."
