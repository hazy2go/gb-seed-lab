// checkSignedPayment: the server relays only our exact payment. Wallets may add priority fees (ComputeBudget) and
// Phantom adds Lighthouse assertions while signing (mainnet 2026-10-20); anything else is refused. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Keypair, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-paycheck-'));
const TREASURY = Keypair.generate().publicKey;
Object.assign(process.env, { NETWORK: 'devnet', KEY_FILE: path.join(dir, 'authority.json'), TREASURY: TREASURY.toBase58(), DATA_DIR: dir });
const sol = await import('../src/solana.mjs');
const { checkSignedPayment, signedPrograms, LIGHTHOUSE, MEMO_PROGRAM, MEMO_PREFIX } = sol;

const buyer = Keypair.generate(), ticket = '0123456789abcdef', price = 50_000_000;
const transfer = (to = TREASURY, lamports = price, from = buyer.publicKey) => SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
const memo = (t = ticket) => new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(MEMO_PREFIX + t) });
const guard = (n = 1) => new TransactionInstruction({ programId: LIGHTHOUSE, keys: [{ pubkey: buyer.publicKey, isSigner: false, isWritable: false }], data: Buffer.from([n, 0, 0, 0]) });
function signed(ixs) {
  const tx = new Transaction({ feePayer: buyer.publicKey, blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 });
  tx.add(...ixs); tx.sign(buyer);
  return tx.serialize();
}

test('plain payment: accepted', () => assert.equal(checkSignedPayment(signed([transfer(), memo()]), ticket, price), null));
test('priority fee added by the wallet: accepted', () => {
  const cb = [ComputeBudgetProgram.setComputeUnitLimit({ units: 20000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })];
  assert.equal(checkSignedPayment(signed([...cb, transfer(), memo()]), ticket, price), null);
});
test('Phantom Lighthouse guards appended: accepted', () => {
  assert.equal(checkSignedPayment(signed([transfer(), memo(), guard(), guard(2)]), ticket, price), null);
  const cb = [ComputeBudgetProgram.setComputeUnitLimit({ units: 30000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 })];
  assert.equal(checkSignedPayment(signed([...cb, transfer(), memo(), guard()]), ticket, price), null);
  assert.equal(checkSignedPayment(signed([guard(), transfer(), memo()]), ticket, price), null);   // anywhere in the order
});
test('too many Lighthouse instructions: refused', () => {
  assert.equal(checkSignedPayment(signed([transfer(), memo(), ...Array.from({ length: 9 }, (_, i) => guard(i))]), ticket, price), 'too many wallet guard instructions');
});
test('Lighthouse never hides a bad payment', () => {
  assert.equal(checkSignedPayment(signed([transfer(Keypair.generate().publicKey), memo(), guard()]), ticket, price), 'wrong recipient');
  assert.equal(checkSignedPayment(signed([transfer(TREASURY, price - 1), memo(), guard()]), ticket, price), 'wrong amount');
  assert.equal(checkSignedPayment(signed([transfer(), memo('ffffffffffffffff'), guard()]), ticket, price), 'wrong memo');
  assert.equal(checkSignedPayment(signed([transfer(), guard()]), ticket, price), 'unexpected instructions');
});
test('any other extra instruction: refused', () => {
  const other = new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.from([1]) });
  assert.equal(checkSignedPayment(signed([transfer(), memo(), other]), ticket, price), 'unexpected instructions');
  assert.equal(checkSignedPayment(signed([transfer(), memo(), transfer(Keypair.generate().publicKey, 1)]), ticket, price), 'unexpected instructions');
  assert.equal(checkSignedPayment(signed([transfer(), memo(), ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 })]), ticket, price), 'unexpected compute budget instructions');
});
test('allowlist grant: still must come from the reserved wallet', () => {
  assert.equal(checkSignedPayment(signed([transfer(), memo(), guard()]), ticket, price, Keypair.generate().publicKey.toBase58()), 'not from the wallet that reserved this price');
});
test('signedPrograms lists program ids; garbage gives null', () => {
  assert.deepEqual(signedPrograms(signed([transfer(), memo(), guard()])), [SystemProgram.programId.toBase58(), MEMO_PROGRAM.toBase58(), LIGHTHOUSE.toBase58()]);
  assert.equal(signedPrograms(Buffer.from([1, 2, 3])), null);
});
