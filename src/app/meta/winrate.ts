// F-011 Task-4: 勝率の計算がメタをどう使うかの説明(受入基準9)。DOM に依存しない
// 勝率の計算(F-005)は仕様が承認済みで、まだ実装されていない。実装されるまでは「メタを使っていない」ことと、
// 現在の入力(F-009 のピックプールの軸)を示し、F-005 の予定(メタの近さ m)を仕様の所在とともに示す
import axes from '../../rating/axes.json' with { type: 'json' };
import engine from '../../rating/config.json' with { type: 'json' };

export interface Row {
  label: string;
  value: string;
}
export interface WinRateMetaView {
  status: '未使用' | '使用中';
  headline: string;
  /** 現在の入力(F-009 のピックプールの軸) */
  current: Row[];
  plannedLabel: string;
  /** F-005 で予定しているメタの使い方 */
  planned: Row[];
  plannedSource: string;
}

interface PoolConfig {
  minGamesPerChampion: number;
  winRatePriorGames: number;
  countWeight: number;
  winRateWeight: number;
}

/** 基準9 */
export function winRateMetaView(opts: { winRateImplemented: boolean } = { winRateImplemented: false }): WinRateMetaView {
  const pool = (axes as unknown as { pool: PoolConfig }).pool;
  const days = (engine as unknown as { engine: { windowDays: number } }).engine.windowDays;
  const half = pool.winRatePriorGames / 2;
  return {
    status: opts.winRateImplemented ? '使用中' : '未使用',
    headline: opts.winRateImplemented
      ? '勝率の計算は、下の「予定」の式でメタの近さを使っています'
      : '勝率の計算はメタを使っていない(勝率の計算 F-005 はまだ実装されていません)',
    current: [
      { label: 'メタに関わる現在の入力', value: '選手の評価(F-009)のピックプールの軸だけ。メタの一覧は、この軸の計算には使っていない' },
      { label: '使う試合', value: `直近 ${days} 日の評価の試合のうち、大会のロールの試合` },
      { label: '数えるチャンピオン', value: `チャンピオンごとに ${pool.minGamesPerChampion} 試合以上` },
      { label: 'チャンピオンの勝率', value: `(勝ち数 + ${half}) / (試合数 + ${pool.winRatePriorGames})(試合数で縮小)` },
      {
        label: 'ピックプールの補正',
        value: `${pool.countWeight} × (チャンピオンの数の、同じロールの選手の中での標準化) + ${pool.winRateWeight} × (勝率の平均の標準化)`,
      },
    ],
    plannedLabel: '勝率の計算(F-005)で予定しているメタの使い方(予定。未実装)',
    planned: [
      { label: 'メタの近さ', value: 'm = 0.5 × m_pool + 0.5 × m_style(0〜1)。チームが早く仕上がるほど勝率に効く(仕上がりの速さ τ に入る)' },
      {
        label: 'チャンピオンの近さ m_pool',
        value: '5人のピックプールのうち、メタの重要チャンピオンに当たるものの重要度(段階A 1.0、段階B 0.5)の合計 ÷ (5 × 3.0)、1 で頭打ち',
      },
      { label: '戦い方の近さ m_style', value: 'チームの戦い方の特性(F-010)と、メタの主流の向きの近さ。主流の向きがメタの一覧に入るまでは m = m_pool(確度 低)' },
    ],
    plannedSource: 'specs/F-005/spec.md(用語「メタの近さ m」、受入基準10)',
  };
}
