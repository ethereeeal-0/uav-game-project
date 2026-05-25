const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Send offer
  router.post('/', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '需要学生身份' });
    }

    const { to_student_id, target_role, salary_offer } = req.body;
    if (!to_student_id || !target_role) {
      return res.status(400).json({ error: '缺少参数' });
    }

    const { classroom_id, team_id } = req.session;
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(team_id);

    const hireCost = 50000;
    if (team.cash < hireCost) {
      return res.status(400).json({ error: '资金不足（挖角费用5万）' });
    }

    db.prepare('UPDATE teams SET cash = cash - ? WHERE id = ?').run(hireCost, team_id);

    db.prepare(`INSERT INTO offers (classroom_id, from_team_id, from_team_name, to_student_id, target_role, salary_offer, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      classroom_id, team_id, team.name, to_student_id, target_role, salary_offer || 30, hireCost
    );

    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(classroom_id, `${team.name} 向 ${to_student_id} 发送挖角邀请，支付猎头费 ¥${hireCost}`);

    res.json({ success: true });
  });

  // Get incoming offers
  router.get('/incoming', auth, (req, res) => {
    if (req.session.user_type !== 'student') return res.json([]);

    const participant = db.prepare('SELECT student_id FROM participants WHERE id = ?').get(req.session.participant_id);
    const offers = db.prepare(
      "SELECT * FROM offers WHERE classroom_id = ? AND to_student_id = ? AND status = 'pending' ORDER BY created_at DESC"
    ).all(req.session.classroom_id, participant.student_id);

    res.json(offers);
  });

  // Get offers sent by my team
  router.get('/sent', auth, (req, res) => {
    if (req.session.user_type !== 'student') return res.json([]);
    const offers = db.prepare('SELECT * FROM offers WHERE from_team_id = ? ORDER BY created_at DESC')
      .all(req.session.team_id);
    res.json(offers);
  });

  // Respond to offer
  router.post('/:id/respond', auth, (req, res) => {
    const { action } = req.body;
    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: '无效操作' });
    }

    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: '邀请不存在' });

    db.prepare('UPDATE offers SET status = ? WHERE id = ?').run(action, offer.id);

    if (action === 'accepted') {
      // Move participant to new team
      db.prepare('UPDATE participants SET team_id = ?, role = ? WHERE id = ?')
        .run(offer.from_team_id, offer.target_role, req.session.participant_id);

      // Update session
      db.prepare('UPDATE sessions SET team_id = ?, role = ? WHERE participant_id = ?')
        .run(offer.from_team_id, offer.target_role, req.session.participant_id);

      db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
        .run(offer.classroom_id, `${offer.to_student_id} 接受了 ${offer.from_team_name} 的挖角邀请`);
    }

    res.json({ success: true });
  });

  // Fire member
  router.post('/fire', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '需要学生身份' });
    }

    const { participant_id } = req.body;
    if (!participant_id) return res.status(400).json({ error: '缺少参数' });

    const target = db.prepare('SELECT * FROM participants WHERE id = ? AND team_id = ?')
      .get(participant_id, req.session.team_id);
    if (!target) return res.status(404).json({ error: '成员不存在' });

    const severance = (target.work_years + 2) * 10000;
    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(req.session.team_id);
    db.prepare('UPDATE teams SET cash = cash - ? WHERE id = ?').run(severance, req.session.team_id);
    db.prepare('DELETE FROM participants WHERE id = ?').run(participant_id);

    db.prepare(`INSERT INTO offers (classroom_id, from_team_id, from_team_name, to_student_id, target_role, status, cost, salary_offer)
      VALUES (?, ?, ?, ?, ?, 'fired', ?, 0)`).run(
      req.session.classroom_id, req.session.team_id, team?.name || '', target.student_id, target.role, severance
    );

    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(req.session.classroom_id, `${team?.name || ''} 解雇了成员 ${target.student_id}(${target.role})，支付遣散费 ¥${severance}`);

    res.json({ success: true, severance });
  });

  return router;
};
