// F-014 Task-4: 根拠の節の材料(評価のファイルとチームの評価のファイル)を、main.ts と同じ方法(ビルド時の glob)で読む
// 集計のコマンドが書いたファイルが無ければ undefined(根拠の節は「材料がありません」を出す)
export function loadRatings(): unknown {
  const m = import.meta.glob('../../../data/public/ratings.json', { eager: true, import: 'default' });
  return Object.values(m)[0];
}

export function loadTeamEvaluation(): unknown {
  const m = import.meta.glob('../../../data/public/team-evaluation.json', { eager: true, import: 'default' });
  return Object.values(m)[0];
}
