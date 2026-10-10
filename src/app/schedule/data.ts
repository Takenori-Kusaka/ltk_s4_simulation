// F-014 Task-3: チームのページと選手のページが勝率表(data/public/winrates.json。F-005 Task-1 の出力)を読む経路。
// main.ts と同じ読み方(props を足さない)。無ければ undefined を返し、画面は「勝率のデータがありません」を出す(基準18)
export function loadWinrates(): unknown {
  const modules = import.meta.glob('../../../data/public/winrates.json', { eager: true, import: 'default' });
  return Object.values(modules)[0];
}
