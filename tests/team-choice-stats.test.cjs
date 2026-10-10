const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/team-choice-stats.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports });
const calculate = (selections) => JSON.parse(JSON.stringify(loaded.exports.calculateTeamChoices(selections)));
let nextFixture = 1;
function matches(team, wins, losses) {
  return Array.from({ length: wins + losses }, (_, index) => {
    const fixture_id = nextFixture++;
    const opponent = `Opponent ${fixture_id}`;
    return {
      fixture_id,
      result: index < wins ? 'won' : 'lost',
      fixture: index % 2 ? { home_team: opponent, away_team: team } : { home_team: team, away_team: opponent },
    };
  });
}

test('combines home and away picks, deduplicates shared games and ignores pending picks', () => {
  const picks = matches('Derby County', 4, 4);
  const result = calculate([...picks, { ...picks[0], player_name: 'Mikey' }, {
    fixture_id: nextFixture++, result: 'pending', fixture: { home_team: 'Derby County', away_team: 'Other' },
  }]);
  const derby = result.won.find(team => team.team === 'Derby County');
  assert.deepEqual(derby, { team: 'Derby County', games: 8, wins: 4, losses: 4, win_rate: 50, loss_rate: 50 });
});

test('requires four settled unique matches, even with shared or pending picks', () => {
  const three = matches('Under minimum', 3, 0);
  const result = calculate([...three, ...three, {
    fixture_id: nextFixture++, result: 'pending', fixture: { home_team: 'Under minimum', away_team: 'Other' },
  }, ...matches('At minimum', 3, 1)]);
  assert.equal(result.won.some(team => team.team === 'Under minimum'), false);
  assert.equal(result.lost.some(team => team.team === 'Under minimum'), false);
  assert.equal(result.won.find(team => team.team === 'At minimum').games, 4);
});

test('returns five teams by rates, showing low win rates for losing teams', () => {
  const result = calculate([
    ...matches('Perfect', 5, 0), ...matches('High rate', 4, 1), ...matches('More wins', 6, 4),
    ...matches('Bad', 1, 4), ...matches('Worst', 0, 5), ...matches('More losses', 4, 6),
  ]);
  assert.deepEqual(result.won.map(team => team.team), ['Perfect', 'High rate', 'More wins', 'More losses', 'Bad']);
  assert.deepEqual(result.lost.map(team => team.team), ['Worst', 'Bad', 'More losses', 'More wins', 'High rate']);
  assert.deepEqual(result.lost.map(team => team.win_rate), [0, 20, 40, 60, 80]);
  assert.equal(result.won.some(team => team.team === 'Worst'), false);
  assert.equal(result.lost.some(team => team.team === 'Perfect'), false);
});

test('normalizes whitespace/case and handles missing fixtures and no eligible teams', () => {
  const picks = matches('Derby County', 3, 2);
  picks[0].fixture.home_team = ' derby county ';
  const result = calculate([...picks, { fixture_id: nextFixture++, result: 'won', fixture: null }]);
  assert.equal(result.won.find(team => team.team.toLowerCase() === 'derby county').games, 5);
  assert.deepEqual(calculate([]), { won: [], lost: [] });
});
