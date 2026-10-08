// F-002: SPA の入口。指標ファイルは data/public/players/*.json(F-003 が出力)から読む
import { mount } from 'svelte';
import App from './components/App.svelte';
import './app.css';
import type { PlayerFile } from '../data/types.ts';

const modules = import.meta.glob('../../data/public/players/*.json', { eager: true, import: 'default' });
const files: Record<string, PlayerFile> = {};
for (const f of Object.values(modules) as PlayerFile[]) files[f.playerId] = f;

mount(App, { target: document.getElementById('app')!, props: { files } });
