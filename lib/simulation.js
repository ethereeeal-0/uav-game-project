function processQuarter(db, classroomId) {
  const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(classroomId);
  if (!gameState) throw new Error('游戏状态不存在');

  const teams = db.prepare('SELECT * FROM teams WHERE classroom_id = ?').all(classroomId);
  const results = [];

  for (const team of teams) {
    const decisions = db.prepare(
      'SELECT * FROM decisions WHERE team_id = ? AND year = ? AND quarter = ?'
    ).all(team.id, gameState.year, gameState.quarter);

    const byRole = {};
    for (const d of decisions) {
      byRole[d.role] = JSON.parse(d.decisions_json);
    }

    const ceo = byRole.CEO || { market: 'domestic', strategy: 'cost', expansion: 50, alliance: 0, capital: 'none' };
    const cio = byRole.CIO || { budget: 50000, focus: '竞争对手', depth: 2, counter: 30, legalRisk: 30 };
    const coo = byRole.COO || { ai: 100000, auto: 50000, patent: 0, supply: 50000, capacity: 30, production: 1000 };
    const cfo = byRole.CFO || { fund: 0, control: 10, leverage: 30, dividend: 5, esg: 50000 };
    const cmo = byRole.CMO || { budget: 100000, price: 5.0, channels: 50000, branding: 40, promo: 30 };
    const hr = byRole.HR || { recruit: 5, training: 50000, salary: '市场水平', equity: 2, culture: 30000 };

    const price = cmo.price * 100;
    const production = Math.min(2000, Math.max(0, coo.production || team.production));
    const marketMult = ceo.market === 'sea' ? 1.15 : 1.0;
    const demandFactor = 1 + (team.market_share / 20) + (cmo.budget / 800000);
    const sold = Math.floor(production * demandFactor * marketMult);
    const revenue = sold * price;

    const varCost = production * 400;
    const fixedCost = 150000;
    const rndCost = (coo.ai || 0) + (coo.auto || 0) + (coo.patent ? 50000 : 0) + (coo.supply || 0);
    const mktCost = (cmo.budget || 0) + (cmo.channels || 0) + (cmo.branding || 0) * 2000;
    const hrCost = (hr.recruit || 0) * 12000 + (hr.training || 0) + (hr.culture || 0);
    const totalCost = varCost + fixedCost + rndCost + mktCost + hrCost;
    const profit = revenue - totalCost + (cfo.fund || 0);

    const newCash = team.cash + profit;
    const newMarketShare = Math.min(28, team.market_share + profit / 500000 + cmo.budget / 800000);
    const newTechLevel = Math.min(5, team.tech_level + (coo.ai || 0) / 400000);
    const newBrand = Math.min(100, team.brand + profit / 400000 + (cmo.branding || 0) / 80);
    const newIntelAccuracy = Math.min(100, team.intel_accuracy + (cio.budget || 0) / 40000 + (cio.depth || 1) * 4);
    const newLegalRisk = Math.max(0, team.legal_risk + Math.random() * 20 - 10 - (cio.legalRisk || 0) / 5);

    const score = profit / 500000 * 20 + newMarketShare * 5 + newTechLevel * 8 + newIntelAccuracy / 6;

    db.prepare(`UPDATE teams SET cash=?, revenue=revenue+?, profit=profit+?,
      market_share=?, brand=?, tech_level=?, intel_accuracy=?, legal_risk=?,
      score=?, production=? WHERE id=?`).run(
      newCash, revenue, profit,
      newMarketShare, newBrand, newTechLevel, newIntelAccuracy, newLegalRisk,
      score, production, team.id
    );

    let feedback = profit > 0
      ? `本季度盈利 ¥${Math.round(profit).toLocaleString()}`
      : `本季度亏损 ¥${Math.abs(Math.round(profit)).toLocaleString()}`;
    feedback += ` | 市场份额: ${newMarketShare.toFixed(1)}% | 技术等级: ${newTechLevel.toFixed(1)}`;

    db.prepare(`INSERT INTO results (team_id, classroom_id, year, quarter, revenue, profit, market_share, score, feedback, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      team.id, classroomId, gameState.year, gameState.quarter,
      revenue, profit, newMarketShare, score, feedback,
      JSON.stringify({ sold, revenue, totalCost, profit, varCost, rndCost, mktCost, hrCost })
    );

    results.push({
      team_id: team.id, team_name: team.name,
      revenue, profit, market_share: newMarketShare, score, feedback
    });
  }

  // Advance quarter
  let newYear = gameState.year;
  let newQuarter = gameState.quarter;
  if (newQuarter === 4) { newYear++; newQuarter = 1; } else { newQuarter++; }
  db.prepare('UPDATE game_state SET year = ?, quarter = ? WHERE classroom_id = ?')
    .run(newYear, newQuarter, classroomId);

  // Log
  db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
    .run(classroomId, `季度推进: 第${gameState.year}年Q${gameState.quarter} → 第${newYear}年Q${newQuarter}`);

  return {
    gameState: { year: newYear, quarter: newQuarter, locked: gameState.locked },
    results
  };
}

module.exports = { processQuarter };
