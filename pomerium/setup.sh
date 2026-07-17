#!/usr/bin/env bash
# Generate pomerium/config.yaml from the example with fresh local secrets.
set -e
cd "$(dirname "$0")"
SS=$(openssl rand -base64 32); CS=$(openssl rand -base64 32)
sed -E "s#__GENERATE_ME__#PLACEHOLDER#" config.example.yaml \
  | awk -v ss="$SS" -v cs="$CS" '/shared_secret:/{sub(/".*"/,"\""ss"\"")} /cookie_secret:/{sub(/".*"/,"\""cs"\"")} {print}' > config.yaml
echo "Wrote pomerium/config.yaml with fresh secrets."
