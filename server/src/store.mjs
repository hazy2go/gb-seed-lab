// Durable state for the mint server.
//   state.json      current pieces, queue, cursor (atomic write + fsync, rotating backups in backups/)
//   payments.jsonl  append-only: every payment we ever saw, with its verdict (the refund source of truth)
//   events.jsonl    append-only: every piece status change (audit trail)
import fs from 'node:fs';
import path from 'node:path';

export function openStore(dir, fingerprint) {
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'pieces'), { recursive: true });
  const file = path.join(dir, 'state.json');
  let state;
  if (fs.existsSync(file)) {
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`state.json is unreadable (${e.message}); restore the newest file from ${path.join(dir, 'backups')}`); }
    for (const k of Object.keys(fingerprint)) {
      if (state.meta?.[k] !== fingerprint[k]) throw new Error(`state.json belongs to ${k}=${state.meta?.[k]}, this server runs ${k}=${fingerprint[k]}; use another DATA_DIR`);
    }
  } else {
    state = { meta: { ...fingerprint, created: new Date().toISOString() }, nextIndex: 1, pieces: [], usedSignatures: {}, cursor: null, closed: false };
  }
  state.usedSignatures ||= {};

  const appendLine = (name, obj) => {
    const fd = fs.openSync(path.join(dir, name), 'a');
    fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n');
    fs.fsyncSync(fd); fs.closeSync(fd);
  };

  let lastBackup = 0;
  function save() {
    const tmp = file + '.tmp', data = JSON.stringify(state, null, 1);
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd);
    fs.renameSync(tmp, file);
    try { const d = fs.openSync(dir, 'r'); fs.fsyncSync(d); fs.closeSync(d); } catch { /* directory fsync is best effort */ }
    if (Date.now() - lastBackup > 5 * 60 * 1000) {
      lastBackup = Date.now();
      fs.writeFileSync(path.join(dir, 'backups', `state-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), data);
      const all = fs.readdirSync(path.join(dir, 'backups')).filter(f => f.startsWith('state-')).sort();
      for (const f of all.slice(0, Math.max(0, all.length - 200))) fs.unlinkSync(path.join(dir, 'backups', f));
    }
  }

  return {
    state, save,
    payment: (obj) => appendLine('payments.jsonl', obj),
    event: (obj) => appendLine('events.jsonl', obj),
    piecesDir: path.join(dir, 'pieces'),
    readPayments() {
      const f = path.join(dir, 'payments.jsonl');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    },
  };
}
