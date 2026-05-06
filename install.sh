#!/usr/bin/env bash
# cross-nft installer — symlinks the skill into ~/.claude/skills/ and
# installs Node deps. Idempotent: safe to re-run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$REPO_DIR/skills/cross-nft"
SKILL_DST="$HOME/.claude/skills/cross-nft"

if [ ! -d "$SKILL_SRC" ]; then
  echo "ERROR: $SKILL_SRC not found. Run install.sh from inside the cloned repo." >&2
  exit 1
fi

mkdir -p "$HOME/.claude/skills"

if [ -L "$SKILL_DST" ]; then
  current="$(readlink "$SKILL_DST")"
  if [ "$current" = "$SKILL_SRC" ]; then
    echo "✓ symlink already points at $SKILL_SRC"
  else
    echo "↻ updating symlink: $SKILL_DST → $SKILL_SRC (was $current)"
    rm "$SKILL_DST"
    ln -s "$SKILL_SRC" "$SKILL_DST"
  fi
elif [ -e "$SKILL_DST" ]; then
  echo "ERROR: $SKILL_DST already exists and is NOT a symlink." >&2
  echo "  Move/back it up, then re-run install.sh." >&2
  exit 1
else
  ln -s "$SKILL_SRC" "$SKILL_DST"
  echo "✓ symlinked $SKILL_DST → $SKILL_SRC"
fi

echo "↻ installing Node deps in $SKILL_SRC ..."
( cd "$SKILL_SRC" && npm ci --silent )
echo "✓ deps installed"

if [ ! -f "$SKILL_SRC/.env" ]; then
  cat <<EOF

NEXT STEPS
  1. (Read-path commands work without a wallet.) Try:
       node $SKILL_SRC/scripts/collections.mjs --top 10
       node $SKILL_SRC/scripts/token.mjs 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e 30164746843126
       node $SKILL_SRC/scripts/listing.mjs 321699
       node $SKILL_SRC/scripts/offers.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --token 30164746843126
       node $SKILL_SRC/scripts/activities.mjs --collection 0xa3bd4e86cd0ec20b03c9710359599c9f82f8fe9e --types sale,listing,offer

  2. (Optional) For trading actions, create your wallet env file:
       cp $SKILL_SRC/.env.example $SKILL_SRC/.env
       chmod 600 $SKILL_SRC/.env
     Then edit it and set PRIVATE_KEY (and ideally MAX_TRADE_NOTIONAL).

  3. Try it from Claude Code:
       "list materials NFT 30164746843126 1개 30 MGT에 팔기"
       "buy listing 321699"
       "offers on 0xa3bd... token 30164746843126"
       "make offer 25 MGT for collection 0x... token 30164746843126"

  NOTE: list / buy / offer / accept-offer above CONFIRM_THRESHOLD (default 1
  payment-token unit) require --confirm. The skill auto-runs setApprovalForAll
  for the NFT contract (one-time) and approve() for ERC-20 payment tokens.

EOF
else
  echo "✓ $SKILL_SRC/.env already present — skipping setup"
fi
