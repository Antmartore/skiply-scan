#!/usr/bin/env python3
"""Generate single-use access codes for gated client pilots (Zeed's spec).

Static-friendly: plaintext codes are printed once to your terminal (text them
to clients); only salted PBKDF2-SHA256 hashes ship in public/codes.json. The
client hashes the entered code locally — no server, works on GitHub Pages.

    python3 scripts/gen_codes.py --count 10 --ttl-hours 24

Rules enforced client-side (see src/gate.js, active behind ?gated=1):
  - code must be redeemed before its expires_at (--ttl-hours from now)
  - redeeming grants a session of --session-minutes (default 60 — "valid 1
    hour" per spec), after which the gate re-locks
  - single-use per device via localStorage

Honest limitation of a fully static gate: "single-use" is per-device, not
global — a code texted to one client can unlock one hour on each device it's
entered on until it expires. Fine for pilots; the Stage-3 backend makes it
global. Regenerate + redeploy to revoke everything at once.
"""
import argparse, base64, hashlib, json, secrets, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Crockford base32 alphabet — no I/L/O/U, so codes survive being read aloud
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ITERATIONS = 100_000


def gen_code(n=6):
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--ttl-hours", type=float, default=24,
                    help="hours before unredeemed codes expire (default 24)")
    ap.add_argument("--session-minutes", type=int, default=60,
                    help="unlocked session length after redemption (default 60)")
    ap.add_argument("--out", type=Path, default=Path("public/codes.json"))
    args = ap.parse_args()

    expires_at = int((time.time() + args.ttl_hours * 3600) * 1000)  # ms, JS-friendly
    entries, plain = [], []
    for i in range(args.count):
        code = gen_code()
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", code.encode(), salt, ITERATIONS)
        entries.append({
            "id": f"c{i+1:03d}",
            "salt": base64.b64encode(salt).decode(),
            "hash": base64.b64encode(digest).decode(),
            "expires_at": expires_at,
        })
        plain.append(code)

    doc = {
        "format": "skiply-codes/1",
        "kdf": "PBKDF2-SHA256",
        "iterations": ITERATIONS,
        "session_minutes": args.session_minutes,
        "generated_at": int(time.time() * 1000),
        "codes": entries,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1))

    exp = datetime.fromtimestamp(expires_at / 1000, tz=timezone.utc)
    print(f"Wrote {args.out} — {args.count} codes, redeemable until {exp:%Y-%m-%d %H:%M UTC},")
    print(f"each unlocking a {args.session_minutes}-minute session. Deploy it, then share:\n")
    for c in plain:
        print(f"  {c}")
    print("\nCodes are shown ONCE — only hashes are stored. Do not commit this output.")


if __name__ == "__main__":
    main()
