import { demand, die, GameError, countBy } from './common.js';
export const DICE_CATEGORIES = [
  ['ones','1의 합'], ['twos','2의 합'], ['threes','3의 합'], ['fours','4의 합'], ['fives','5의 합'], ['sixes','6의 합'],
  ['choice','초이스'], ['four','포카드'], ['full','풀하우스'], ['small','리틀 스트레이트'], ['large','빅 스트레이트'], ['yacht','요트']
];
export function diceScore(category, dice) {
  const total = dice.reduce((a, b) => a + b, 0);
  const upper = ['ones','twos','threes','fours','fives','sixes'].indexOf(category);
  if (upper !== -1) return dice.filter((d) => d === upper + 1).reduce((a,b) => a+b,0);
  const counts = countBy(dice);
  const ordered = [...dice].sort((a,b)=>a-b).join(',');
  if (category === 'choice') return total;
  if (category === 'four') return Math.max(...counts) >= 4 ? total : 0;
  if (category === 'full') return counts.includes(2) && counts.includes(3) ? total : 0;
  if (category === 'small') {const unique = new Set(dice); return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(run=>run.every(n=>unique.has(n))) ? 15 : 0;}
  if (category === 'large') return ['1,2,3,4,5','2,3,4,5,6'].includes(ordered) ? 30 : 0;
  if (category === 'yacht') return Math.max(...counts) === 5 ? 50 : 0;
  return null;
}
export function diceTotal(scores) { const upper = ['ones','twos','threes','fours','fives','sixes'].reduce((n,k)=>n+(scores[k]||0),0); return Object.values(scores).reduce((a,b)=>a+b,0)+(upper>=63?35:0); }
export function createDiceGame(players) {
  return { kind:'dice', players: players.map((p)=>p.id), turn:0, dice:[0,0,0,0,0], held:[false,false,false,false,false],
    rolls:0, scores:Object.fromEntries(players.map((p)=>[p.id, {}])), winner:null, revision:1 };
}
export function applyDiceAction(g, pid, action) {
  demand(!g.winner, '이미 끝난 게임이에요.');
  demand(g.players[g.turn] === pid, '아직 내 차례가 아니에요.');
  if (action.type === 'roll') {
    demand(g.rolls < 3, '주사위는 한 턴에 세 번까지 굴려요.');
    g.dice = g.dice.map((d,i)=>g.held[i] ? d : die());
    g.rolls++;
  } else if (action.type === 'hold') {
    demand(g.rolls > 0 && g.rolls < 3, '굴린 뒤에 주사위를 보관할 수 있어요.');
    demand(Number.isInteger(action.index) && action.index >= 0 && action.index < 5, '주사위를 확인해 주세요.');
    g.held[action.index] = !g.held[action.index];
  } else if (action.type === 'score') {
    const cat = action.category;
    demand(g.rolls > 0, '먼저 주사위를 굴려 주세요.');
    demand(DICE_CATEGORIES.some(([k])=>k===cat) && g.scores[pid][cat] === undefined, '이미 기록했거나 없는 칸이에요.');
    g.scores[pid][cat] = diceScore(cat, g.dice);
    if (g.players.every((p)=>Object.keys(g.scores[p]).length === DICE_CATEGORIES.length)) {
      const sum = (p)=>diceTotal(g.scores[p]);
      const max = Math.max(...g.players.map(sum));
      g.winners = g.players.filter((p)=>sum(p)===max);
      g.winner = g.winners[0];
    } else {
      g.turn = (g.turn + 1) % g.players.length;
      g.dice = [0,0,0,0,0]; g.held = [false,false,false,false,false]; g.rolls = 0;
    }
  } else throw new GameError('알 수 없는 동작이에요.');
  g.revision++;
}
export function diceView(g) {
  return { kind:'dice', turn:g.players[g.turn], dice:g.dice, held:g.held, rolls:g.rolls,
    scores:g.scores, totals:Object.fromEntries(g.players.map(p=>[p,diceTotal(g.scores[p])])), bonus:Object.fromEntries(g.players.map(p=>[p,['ones','twos','threes','fours','fives','sixes'].reduce((n,k)=>n+(g.scores[p][k]||0),0)>=63?35:0])), winner:g.winner, winners:g.winners || [], revision:g.revision, categories:DICE_CATEGORIES };
}
