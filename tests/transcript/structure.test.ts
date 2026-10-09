// F-009 Task-10: 文字起こしの前処理(重なりの除去・区間・関連の絞り込み・選手の対応付け・手がかりの数)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/roster.ts';
import { parseLines, dedupeLines, toSegments, nameTable, structureTranscript } from '../../src/transcript/structure.ts';
import { main, championNames } from '../../src/transcript/cli.ts';
import aliases from '../../src/transcript/aliases.json' with { type: 'json' };

/** 作り物の自動字幕(前の行の文が次の行の先頭に繰り返される) */
const RAW = [
  '[0:00] こんにちは。',
  '',
  '[0:02] こんにちは。 今日は晩ご飯の話をします。',
  '[0:05] 今日は晩ご飯の話をします。 カレーが好きです。',
  '[0:40] カレーが好きです。 さてトップのレーン戦の話。',
  '[0:44] さてトップのレーン戦の話。 アルファ君はジャングルでコールしてた。',
  '[0:49] アルファ君はジャングルでコールしてた。 ドラゴン取ろう、寄って。',
  '[1:30] 葛葉はミッドが上手い。オラフも得意。',
  '[1:33] 叶える夢の話。',
].join('\n');
const CHAMPS = ['オラフ', 'アーリ'];

test('時刻つきの行を読み、時刻の無い行と空の行を除く', () => {
  const ls = parseLines('﻿[0:05] a\r\nnoise\r\n[1:02:03] b\r\n[0:07]   \r\n');
  assert.deepEqual(ls, [{ tSec: 5, text: 'a' }, { tSec: 3723, text: 'b' }]);
});

test('自動字幕の転がる重なりを除き、各発話を1回にする', () => {
  const d = dedupeLines(parseLines(RAW));
  assert.deepEqual(d.slice(0, 4).map((l) => l.text), ['こんにちは。', '今日は晩ご飯の話をします。', 'カレーが好きです。', 'さてトップのレーン戦の話。']);
  assert.equal(d.filter((l) => l.text.includes('アルファ君')).length, 1);
  assert.deepEqual(dedupeLines([{ tSec: 0, text: 'abc' }, { tSec: 1, text: 'abc' }]), [{ tSec: 0, text: 'abc' }]);
});

test('区間は間の空き・最長・目安を超えた後の文の終わりで切る', () => {
  const s = toSegments([{ tSec: 0, text: 'あ。' }, { tSec: 5, text: 'い' }, { tSec: 21, text: 'う。' }, { tSec: 22, text: 'え' }, { tSec: 60, text: 'お' }], 20, 30, 8);
  assert.deepEqual(s.map((x) => x.text), ['あ。 い', 'う。 え', 'お']);
  const long = toSegments([0, 7, 14, 21, 28, 35].map((t) => ({ tSec: t, text: 'x' })), 20, 30, 8);
  assert.deepEqual(long.map((x) => x.tSec), [0, 35]);
});

test('LoL・LTK と無関係の区間を落とし、関連の区間だけを残す', () => {
  const r = structureTranscript(RAW, 'x.md', { roster: ROSTER, champions: CHAMPS });
  assert.ok(r.segmentsTotal > r.segmentsKept);
  assert.ok(r.segments.every((s) => !s.text.includes('晩ご飯')));
  assert.ok(r.segments.some((s) => s.text.includes('ドラゴン')));
  assert.ok(r.keptChars < r.rawChars);
});

test('選手の名前と別名を名簿の ID に対応づけ、1 文字の名前は語の区切りでだけ一致させる', () => {
  const r = structureTranscript(RAW, 'x.md', { roster: ROSTER, champions: CHAMPS });
  const ids = new Set(r.segments.flatMap((s) => s.players));
  assert.ok(ids.has('IT-CORE-JG'));
  assert.ok(ids.has('CC-CORE-MID'));
  assert.ok(!ids.has('CC-NEXT-TOP'), '「叶える」を叶に一致させない');
  const t = nameTable([{ id: 'X', name: '叶' }], []);
  assert.deepEqual(t, [{ text: '叶', id: 'X', confidence: 'high' }]);
});

test('確信の低い別名は players へ入れず candidates へ入れる', () => {
  const r = structureTranscript('[0:00] ニコさんのボットの話。', 'x.md', { roster: ROSTER });
  assert.deepEqual(r.segments[0].players, []);
  assert.deepEqual(r.segments[0].candidates, ['LR-CORE-ADC']);
});

test('コール・プレイスタンス・評価の手がかりとコールの言い回しを、区間と選手ごとに数える', () => {
  const r = structureTranscript(RAW, 'x.md', { roster: ROSTER, champions: CHAMPS });
  const seg = r.segments.find((s) => s.players.includes('IT-CORE-JG'))!;
  assert.ok(seg.categories.shotcalling >= 1);
  assert.ok(seg.callPhrases >= 2);
  const p = r.perPlayer['IT-CORE-JG'];
  assert.equal(p.mentions, 1);
  assert.ok(p.addressedCallPhrases >= 2);
  assert.ok(r.perPlayer['CC-CORE-MID'].categories.polarityPositive >= 2);
  assert.ok(r.caveats.some((c) => /話者/.test(c)));
  assert.ok(r.topKeywords.length > 0 && r.topKeywords.every(([w]) => [...w].length >= 2));
});

test('別名の表の ID はすべて名簿にある', () => {
  const ids = new Set(ROSTER.map((p) => p.id));
  for (const a of (aliases as { aliases: { id: string }[] }).aliases) assert.ok(ids.has(a.id), a.id);
});

test('命令: 置き場の文字起こしを読み、structured/ に構造化したファイルを書く。置き場が無ければ 1', () => {
  const d = mkdtempSync(join(tmpdir(), 'tr-'));
  const inDir = join(d, 'transcript');
  mkdirSync(inDir);
  writeFileSync(join(inDir, 'a.md'), RAW);
  const meta = join(d, 'meta');
  mkdirSync(meta);
  writeFileSync(join(meta, 'm.json'), JSON.stringify({ champions: [{ name: 'オラフ' }] }));
  const dd = join(d, 'champions.json');
  writeFileSync(dd, JSON.stringify({ champions: { Ahri: 'アーリ' } }));
  assert.deepEqual(championNames(meta, dd).sort(), ['アーリ', 'オラフ']);
  const lines: string[] = [];
  assert.equal(main(['--in', inDir, '--meta', meta, '--champions', dd], (l) => lines.push(l)), 0);
  const out = join(inDir, 'structured', 'a.json');
  assert.ok(existsSync(out));
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).kind, 'transcript-structured');
  assert.match(lines[0], /a\.md/);
  assert.equal(main(['--in', join(d, 'none')], () => {}), 1);
});
