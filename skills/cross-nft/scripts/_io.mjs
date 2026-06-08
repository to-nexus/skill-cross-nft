// Tiny argv parser + JSON envelope writer. Every script emits a single
// JSON object on stdout (the SKILL.md contract).

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          flags[key] = true;
        } else {
          flags[key] = next;
          i++;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function emit(obj) {
  process.stdout.write(JSON.stringify(obj, replacer) + '\n');
}

function replacer(_k, v) {
  if (typeof v === 'bigint') return v.toString();
  return v;
}

export async function main(fn) {
  try {
    const out = await fn();
    if (out !== undefined) emit(out);
    process.exit(out && out.ok === false ? (out.error === 'awaiting_confirm' ? 2 : 1) : 0);
  } catch (e) {
    emit({ ok: false, error: 'unhandled', detail: e?.message || String(e) });
    if (process.env.DEBUG) process.stderr.write((e?.message || '') + '\n');
    process.exit(1);
  }
}
