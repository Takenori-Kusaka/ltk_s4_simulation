// F-002: 公式発表(2026-10-07)の60名。Riot ID は docs/research/riot-ids.json(2026-10-08 に Riot API で確認)
import type { TeamId, Tier } from '../sim/types.ts';

export type Role = 'TOP' | 'JG' | 'MID' | 'ADC' | 'SUP';

export interface Player {
  id: string;
  name: string;
  team: TeamId;
  tier: Tier;
  role: Role;
  /** gameName#tagLine。未特定は null */
  riotId: string | null;
}

export const ROSTER: readonly Player[] = [
  { id: 'DD-MASTERS-TOP', name: "わしだい", team: 'DD', tier: 'MASTERS', role: 'TOP', riotId: "鉄砲玉#JP1" },
  { id: 'DD-MASTERS-JG', name: "しゃるる", team: 'DD', tier: 'MASTERS', role: 'JG', riotId: "syaruru#0323" },
  { id: 'DD-MASTERS-MID', name: "たぬき忍者", team: 'DD', tier: 'MASTERS', role: 'MID', riotId: "Ninja of Ninjas#JP1" },
  { id: 'DD-MASTERS-ADC', name: "Day1", team: 'DD', tier: 'MASTERS', role: 'ADC', riotId: "Day1week#Day1" },
  { id: 'DD-MASTERS-SUP', name: "hetel", team: 'DD', tier: 'MASTERS', role: 'SUP', riotId: "hetel#JP1" },
  { id: 'DD-CORE-TOP', name: "酒寄颯馬", team: 'DD', tier: 'CORE', role: 'TOP', riotId: "Sakayori Soma#003" },
  { id: 'DD-CORE-JG', name: "きなこ", team: 'DD', tier: 'CORE', role: 'JG', riotId: "kinako#hmm" },
  { id: 'DD-CORE-MID', name: "スタンミじゃぱん", team: 'DD', tier: 'CORE', role: 'MID', riotId: "スタンミジャパン#JP1" },
  { id: 'DD-CORE-ADC', name: "じゃすぱー", team: 'DD', tier: 'CORE', role: 'ADC', riotId: "Jasper7se#CR1" },
  { id: 'DD-CORE-SUP', name: "神楽めあ", team: 'DD', tier: 'CORE', role: 'SUP', riotId: "rnea#JP1" },
  { id: 'DD-NEXT-TOP', name: "SHAKA", team: 'DD', tier: 'NEXT', role: 'TOP', riotId: "shakach#JP1" },
  { id: 'DD-NEXT-JG', name: "まざー3", team: 'DD', tier: 'NEXT', role: 'JG', riotId: "Toy Story2#JP2" },
  { id: 'DD-NEXT-MID', name: "天ノ川ねる", team: 'DD', tier: 'NEXT', role: 'MID', riotId: "neringojp#666" },
  { id: 'DD-NEXT-ADC', name: "夢野あかり", team: 'DD', tier: 'NEXT', role: 'ADC', riotId: "Akaringgg#555" },
  { id: 'DD-NEXT-SUP', name: "白波らむね", team: 'DD', tier: 'NEXT', role: 'SUP', riotId: "ramuchi#えぐち" },
  { id: 'CC-MASTERS-TOP', name: "Yutapon", team: 'CC', tier: 'MASTERS', role: 'TOP', riotId: "ytzz#2426" },
  { id: 'CC-MASTERS-JG', name: "Rainbrain", team: 'CC', tier: 'MASTERS', role: 'JG', riotId: "Rainbrain#JP1" },
  { id: 'CC-MASTERS-MID', name: "Ceros", team: 'CC', tier: 'MASTERS', role: 'MID', riotId: "Ceros#111" },
  { id: 'CC-MASTERS-ADC', name: "Yuhi", team: 'CC', tier: 'MASTERS', role: 'ADC', riotId: "Yuhi#045" },
  { id: 'CC-MASTERS-SUP', name: "Nemoh", team: 'CC', tier: 'MASTERS', role: 'SUP', riotId: "弱者ネ申#Nemoh" },
  { id: 'CC-CORE-TOP', name: "YUKIO", team: 'CC', tier: 'CORE', role: 'TOP', riotId: "岡野やうじ#5567" },
  { id: 'CC-CORE-JG', name: "k4sen", team: 'CC', tier: 'CORE', role: 'JG', riotId: "若干ワース#k4sen" },
  { id: 'CC-CORE-MID', name: "葛葉", team: 'CC', tier: 'CORE', role: 'MID', riotId: "Lagusa#JP1" },
  { id: 'CC-CORE-ADC', name: "龍巻ちせ", team: 'CC', tier: 'CORE', role: 'ADC', riotId: "tornado3#JP0" },
  { id: 'CC-CORE-SUP', name: "昏昏アリア", team: 'CC', tier: 'CORE', role: 'SUP', riotId: "教 祖#666" },
  { id: 'CC-NEXT-TOP', name: "叶", team: 'CC', tier: 'NEXT', role: 'TOP', riotId: "とうもろこし#かなえ" },
  { id: 'CC-NEXT-JG', name: "ゆふな", team: 'CC', tier: 'NEXT', role: 'JG', riotId: "YufuNa#DDwin" },
  { id: 'CC-NEXT-MID', name: "空澄セナ", team: 'CC', tier: 'NEXT', role: 'MID', riotId: "あしゅ公#0118" },
  { id: 'CC-NEXT-ADC', name: "獅子堂あかり", team: 'CC', tier: 'NEXT', role: 'ADC', riotId: "uouo#4410" },
  { id: 'CC-NEXT-SUP', name: "鷹宮リオン", team: 'CC', tier: 'NEXT', role: 'SUP', riotId: "名誉0の人#JP1" },
  { id: 'IT-MASTERS-TOP', name: "らいじん", team: 'IT', tier: 'MASTERS', role: 'TOP', riotId: "らいじん#JP1" },
  { id: 'IT-MASTERS-JG', name: "ゆにか", team: 'IT', tier: 'MASTERS', role: 'JG', riotId: "ゆにか#1122" },
  { id: 'IT-MASTERS-MID', name: "Eugeo", team: 'IT', tier: 'MASTERS', role: 'MID', riotId: "Eugeo#DDWIN" },
  { id: 'IT-MASTERS-ADC', name: "Zerost", team: 'IT', tier: 'MASTERS', role: 'ADC', riotId: "Zeroyusi#zzz" },
  { id: 'IT-MASTERS-SUP', name: "Enty", team: 'IT', tier: 'MASTERS', role: 'SUP', riotId: "えんてぃ#ENTP" },
  { id: 'IT-CORE-TOP', name: "mittiii", team: 'IT', tier: 'CORE', role: 'TOP', riotId: "SBJ mittiii#000" },
  { id: 'IT-CORE-JG', name: "AlphaAzur", team: 'IT', tier: 'CORE', role: 'JG', riotId: "Alpha Azur#アくん" },
  { id: 'IT-CORE-MID', name: "たかやスペシャル", team: 'IT', tier: 'CORE', role: 'MID', riotId: "たかスペ#JP2" },
  { id: 'IT-CORE-ADC', name: "ごんかね", team: 'IT', tier: 'CORE', role: 'ADC', riotId: "豚トロ#umai" },
  { id: 'IT-CORE-SUP', name: "レグルシュ・ライオンハート", team: 'IT', tier: 'CORE', role: 'SUP', riotId: "ReglushLionheart#JP1" },
  { id: 'IT-NEXT-TOP', name: "橘ひなの", team: 'IT', tier: 'NEXT', role: 'TOP', riotId: "hinano#4777" },
  { id: 'IT-NEXT-JG', name: "ありけん", team: 'IT', tier: 'NEXT', role: 'JG', riotId: "米炊き小坊主#ツツツ" },
  { id: 'IT-NEXT-MID', name: "まいたけ", team: 'IT', tier: 'NEXT', role: 'MID', riotId: "まいちゃけ#きのこ" },
  { id: 'IT-NEXT-ADC', name: "天帝フォルテ", team: 'IT', tier: 'NEXT', role: 'ADC', riotId: "100000tap#4002" },
  { id: 'IT-NEXT-SUP', name: "白那しずく", team: 'IT', tier: 'NEXT', role: 'SUP', riotId: "467#429" },
  { id: 'LR-MASTERS-TOP', name: "apaMEN", team: 'LR', tier: 'MASTERS', role: 'TOP', riotId: "もちあき#イルボン" },
  { id: 'LR-MASTERS-JG', name: "ねすてぃー", team: 'LR', tier: 'MASTERS', role: 'JG', riotId: "ねすてぃー#7777" },
  { id: 'LR-MASTERS-MID', name: "Recap", team: 'LR', tier: 'MASTERS', role: 'MID', riotId: "Recap#125" },
  { id: 'LR-MASTERS-ADC', name: "ハレっち", team: 'LR', tier: 'MASTERS', role: 'ADC', riotId: "Haretti#hare" },
  { id: 'LR-MASTERS-SUP', name: "てぃんとん", team: 'LR', tier: 'MASTERS', role: 'SUP', riotId: "てぃんとん#1017" },
  { id: 'LR-CORE-TOP', name: "焼きパン", team: 'LR', tier: 'CORE', role: 'TOP', riotId: "Varvalian#sfr" },
  { id: 'LR-CORE-JG', name: "Killin9Hit", team: 'LR', tier: 'CORE', role: 'JG', riotId: "チョゴチュジャン#7777" },
  { id: 'LR-CORE-MID', name: "乾伸一郎", team: 'LR', tier: 'CORE', role: 'MID', riotId: "乾伸一郎#JP1" },
  { id: 'LR-CORE-ADC', name: "大御所にゅん子", team: 'LR', tier: 'CORE', role: 'ADC', riotId: "moonshine#密造酒" },
  { id: 'LR-CORE-SUP', name: "千燈ゆうひ", team: 'LR', tier: 'CORE', role: 'SUP', riotId: "千 燈#1010" },
  { id: 'LR-NEXT-TOP', name: "狐白うる", team: 'LR', tier: 'NEXT', role: 'TOP', riotId: "狐白うる#6122" },
  { id: 'LR-NEXT-JG', name: "アステル・レダ", team: 'LR', tier: 'NEXT', role: 'JG', riotId: "横揺れしテルレダ#ODORE" },
  { id: 'LR-NEXT-MID', name: "春茶", team: 'LR', tier: 'NEXT', role: 'MID', riotId: "BBIBBI#010" },
  { id: 'LR-NEXT-ADC', name: "なぎさっち", team: 'LR', tier: 'NEXT', role: 'ADC', riotId: "なぎさっち#JP1" },
  { id: 'LR-NEXT-SUP', name: "No.1005", team: 'LR', tier: 'NEXT', role: 'SUP', riotId: "とおこ#JP1" },
];
