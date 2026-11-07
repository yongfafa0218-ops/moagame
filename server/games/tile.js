import { demand, GameError, shuffle } from './common.js';

const COLORS = ['coral', 'blue', 'gold', 'ink'];

// Runs must be ordered by position. Sets require distinct colours. Jokers may
// stand in for a missing tile, but a combination may not be all jokers.
export function combinationScore(tiles) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.some((t) => !t)) return null;
  const natural = tiles.filter((t) => !t.joker);
  if (!natural.length) return null;
  let best = null;
  if (tiles.length <= 4 && natural.every((t) => t.number === natural[0].number)
      && new Set(natural.map((t) => t.color)).size === natural.length) {
    best = natural[0].number * tiles.length;
  }
  if (natural.every((t) => t.color === natural[0].color)) {
    const firstIndex = tiles.findIndex((t) => !t.joker);
    const start = tiles[firstIndex].number - firstIndex;
    const valid = start >= 1 && start + tiles.length - 1 <= 13
      && tiles.every((t, i) => t.joker || (t.color === natural[0].color && t.number === start + i));
    if (valid) {
      const score = tiles.length * (2 * start + tiles.length - 1) / 2;
      best = Math.max(best ?? 0, score);
    }
  }
  return best;
}

export function createTileGame(players) {
  const tiles = {};
  let id = 0;
  const packs = players.length >= 5 ? 3 : 2;
  for (let pack = 0; pack < packs; pack++) {
    for (const color of COLORS) for (let number = 1; number <= 13; number++) {
      const tile = { id: `t${id++}`, color, number, joker: false };
      tiles[tile.id] = tile;
    }
  }
  // Classic: 104 numbers + 2 jokers. 5–6 players: 156 numbers + 4 jokers.
  for (let i = 0; i < (packs === 3 ? 4 : 2); i++) {
    const tile = { id: `t${id++}`, color: 'joker', number: null, joker: true };
    tiles[tile.id] = tile;
  }
  const stock = shuffle(Object.keys(tiles));
  const hands = {};
  const opened = {};
  for (const p of players) { hands[p.id] = stock.splice(0, 14); opened[p.id] = false; }
  return { kind: 'tile', players: players.map((p) => p.id), tiles, stock, hands, opened, board: [],
    turn: 0, revision: 1, winner: null, endReason: null, consecutivePasses: 0, packs };
}

export function applyTileAction(g, pid, action) {
  demand(!g.winner, '이미 끝난 게임이에요.');
  demand(g.players[g.turn] === pid, '아직 내 차례가 아니에요.');
  if (action.type === 'draw') {
    if (g.stock.length) {
      g.hands[pid].push(g.stock.pop());
      g.consecutivePasses = 0;
    } else {
      g.consecutivePasses++;
      if (g.consecutivePasses >= g.players.length) {
        const penalty = (p) => g.hands[p].reduce((n, id) => n + (g.tiles[id].joker ? 30 : g.tiles[id].number), 0);
        const min = Math.min(...g.players.map(penalty));
        g.winners = g.players.filter((p) => penalty(p) === min);
        g.winner = g.winners[0];
        g.endReason = '남은 타일이 없어 모두 넘겼어요. 손패 점수가 가장 낮은 사람이 이겼어요.';
      }
    }
  } else if (action.type === 'commit') {
    const proposed = action.board;
    demand(Array.isArray(proposed) && proposed.length <= 100 && proposed.every(Array.isArray), '조합을 확인해 주세요.');
    const flat = proposed.flat();
    const old = g.board.flat();
    const oldSet = new Set(old);
    const mySet = new Set(g.hands[pid]);
    demand(new Set(flat).size === flat.length, '같은 타일을 두 번 놓을 수 없어요.');
    demand(flat.every((id) => typeof id === 'string' && (oldSet.has(id) || mySet.has(id))), '사용할 수 없는 타일이 있어요.');
    demand(old.every((id) => flat.includes(id)), '테이블의 타일은 다시 테이블에 놓아야 해요.');
    const added = flat.filter((id) => mySet.has(id));
    demand(added.length > 0, '내 타일을 최소 한 장은 내려놓아야 해요.');
    const scores = proposed.map((group) => combinationScore(group.map((id) => g.tiles[id])));
    demand(scores.every((score) => score !== null), '완성되지 않은 조합이 있어요. 같은 숫자·다른 색 또는 같은 색·연속 숫자 3개 이상인지 확인해 주세요.');
    if (!g.opened[pid]) {
      // Before the first opening the previous board cannot be manipulated.
      const unchangedOld = g.board.every((oldGroup) => proposed.some((candidate) =>
        candidate.length === oldGroup.length && candidate.every((id, i) => id === oldGroup[i])));
      const newGroups = proposed.filter((group) => !group.some((id) => oldSet.has(id)));
      demand(unchangedOld && proposed.every((group) => !group.some((id) => oldSet.has(id)) ||
        g.board.some((oldGroup) => oldGroup.length === group.length && oldGroup.every((id, i) => id === group[i]))),
      '첫 등록 전에는 테이블 타일을 움직일 수 없어요.');
      const openingScore = newGroups.reduce((sum, group) => sum + combinationScore(group.map((id) => g.tiles[id])), 0);
      demand(openingScore >= 30, `첫 등록은 내 타일로 합계 30점 이상이어야 해요. (현재 ${openingScore}점)`);
      g.opened[pid] = true;
    }
    g.board = proposed.map((group) => [...group]);
    const used = new Set(added);
    g.hands[pid] = g.hands[pid].filter((id) => !used.has(id));
    g.consecutivePasses = 0;
    if (!g.hands[pid].length) { g.winner = pid; g.endReason = '가장 먼저 타일을 모두 내려놓았어요!'; }
  } else throw new GameError('알 수 없는 동작이에요.');
  if (!g.winner) g.turn = (g.turn + 1) % g.players.length;
  g.revision++;
}

export function tileView(g, pid) {
  return { kind: 'tile', turn: g.players[g.turn], revision: g.revision, winner: g.winner, winners: g.winners || (g.winner ? [g.winner] : []), endReason: g.endReason,
    penalties: g.winner ? Object.fromEntries(g.players.map(p => [p, g.hands[p].reduce((n,id)=>n+(g.tiles[id].joker?30:g.tiles[id].number),0)])) : null,
    stockCount: g.stock.length, packs: g.packs,
    board: g.board.map((group) => group.map((id) => g.tiles[id])),
    rack: (g.hands[pid] || []).map((id) => g.tiles[id]),
    players: Object.fromEntries(g.players.map((p) => [p, { count: g.hands[p].length, opened: g.opened[p] }])) };
}
