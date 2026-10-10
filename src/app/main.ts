// F-002: SPA の入口。指標ファイルは data/public/players/*.json(F-003 が出力)から読む
import { mount } from 'svelte';
import App from './components/App.svelte';
import './app.css';
import type { PlayerFile } from '../data/types.ts';
import type { RatingsFile } from './rating/view.ts';

const modules = import.meta.glob('../../data/public/players/*.json', { eager: true, import: 'default' });
const files: Record<string, PlayerFile> = {};
for (const f of Object.values(modules) as PlayerFile[]) files[f.playerId] = f;

// F-009: 評価のファイル(aggregate-cli が常識の一覧の検査に通ったときだけ書く)。無ければ全軸データなし
const ratingModules = import.meta.glob('../../data/public/ratings.json', { eager: true, import: 'default' });
const ratings = Object.values(ratingModules)[0] as RatingsFile | undefined;

// F-013: 勝率表のファイル(F-005 Task-1 の出力)。無ければページに「勝率のデータがありません」
const winrateModules = import.meta.glob('../../data/public/winrates.json', { eager: true, import: 'default' });
const winrates = Object.values(winrateModules)[0];

mount(App, { target: document.getElementById('app')!, props: { files, ratings, winrates } });
