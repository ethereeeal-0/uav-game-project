const API = {
  token: localStorage.getItem('UAV_TOKEN'),

  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    if (res.status === 401) {
      this.clearToken();
      location.reload();
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  },

  setToken(token) {
    this.token = token;
    localStorage.setItem('UAV_TOKEN', token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('UAV_TOKEN');
  },

  // Auth
  async teacherRegister(username, password) {
    const data = await this.request('POST', '/api/auth/teacher/register', { username, password });
    if (data) this.setToken(data.token);
    return data;
  },

  async teacherLogin(username, password) {
    const data = await this.request('POST', '/api/auth/teacher/login', { username, password });
    if (data) this.setToken(data.token);
    return data;
  },

  async studentLogin(params) {
    const data = await this.request('POST', '/api/auth/student/login', params);
    if (data) this.setToken(data.token);
    return data;
  },

  async getSession() {
    return this.request('GET', '/api/auth/session');
  },

  async logout() {
    await this.request('POST', '/api/auth/logout').catch(() => {});
    this.clearToken();
  },

  // Classrooms
  async createClassroom(id, name) {
    return this.request('POST', '/api/classrooms', { id, name });
  },

  async getClassrooms() {
    return this.request('GET', '/api/classrooms');
  },

  async getClassroomDetail(classId) {
    return this.request('GET', '/api/classrooms/' + classId);
  },

  async deleteClassroom(classId) {
    return this.request('DELETE', '/api/classrooms/' + classId);
  },

  // Teams
  async registerTeam(classroom_id, name, code, password) {
    return this.request('POST', '/api/teams', { classroom_id, name, code, password });
  },

  async getTeams(classId) {
    return this.request('GET', '/api/teams/classroom/' + classId);
  },

  async getTeamDetail(teamId) {
    return this.request('GET', '/api/teams/' + teamId);
  },

  async getTeamHistory(teamId) {
    return this.request('GET', '/api/teams/' + teamId + '/history');
  },

  // Game
  async getGameState(classId) {
    return this.request('GET', '/api/game/' + classId + '/state');
  },

  async advanceQuarter(classId) {
    return this.request('POST', '/api/game/' + classId + '/advance');
  },

  async toggleLock(classId) {
    return this.request('POST', '/api/game/' + classId + '/lock');
  },

  async resetClassroom(classId) {
    return this.request('POST', '/api/game/' + classId + '/reset');
  },

  async broadcast(classId, title, content) {
    return this.request('POST', '/api/game/' + classId + '/broadcast', { title, content });
  },

  async randomEvent(classId) {
    return this.request('POST', '/api/game/' + classId + '/random-event');
  },

  async getRankings(classId) {
    return this.request('GET', '/api/game/' + classId + '/rankings');
  },

  async getNews(classId) {
    return this.request('GET', '/api/game/' + classId + '/news');
  },

  async getLogs(classId) {
    return this.request('GET', '/api/game/' + classId + '/logs');
  },

  // Decisions
  async submitDecision(decisions) {
    return this.request('POST', '/api/decisions', { decisions });
  },

  async checkDecision() {
    return this.request('GET', '/api/decisions/check');
  },

  async updateRisk(risk_value) {
    return this.request('POST', '/api/decisions/risk', { risk_value });
  },

  async getClassDecisions(classId, year, quarter) {
    let url = '/api/decisions/classroom/' + classId;
    const params = [];
    if (year) params.push('year=' + year);
    if (quarter) params.push('quarter=' + quarter);
    if (params.length) url += '?' + params.join('&');
    return this.request('GET', url);
  },

  // Ratings
  async submitYearlyRating(ratings, year) {
    return this.request('POST', '/api/ratings/yearly', { ratings, year });
  },

  async submitAllianceRating(ratings, year, half) {
    return this.request('POST', '/api/ratings/alliance', { ratings, year, half });
  },

  async checkRating(year) {
    return this.request('GET', '/api/ratings/check/' + year);
  },

  async getClassRatings(classId) {
    return this.request('GET', '/api/ratings/classroom/' + classId);
  },

  // Offers
  async sendOffer(to_student_id, target_role, salary_offer) {
    return this.request('POST', '/api/offers', { to_student_id, target_role, salary_offer });
  },

  async getIncomingOffers() {
    return this.request('GET', '/api/offers/incoming');
  },

  async getSentOffers() {
    return this.request('GET', '/api/offers/sent');
  },

  async respondOffer(offerId, action) {
    return this.request('POST', '/api/offers/' + offerId + '/respond', { action });
  },

  async fireMember(participant_id) {
    return this.request('POST', '/api/offers/fire', { participant_id });
  },

  // Alliances
  async getTeamAlliances(teamId) {
    return this.request('GET', '/api/alliances/team/' + teamId);
  },

  async getClassAlliances(classId) {
    return this.request('GET', '/api/alliances/classroom/' + classId);
  },

  async sendAllianceRequest(to_team_id, field, type) {
    return this.request('POST', '/api/alliances/requests', { to_team_id, field, type });
  },

  async getIncomingAllianceRequests() {
    return this.request('GET', '/api/alliances/requests/incoming');
  },

  async respondAllianceRequest(requestId, action) {
    return this.request('POST', '/api/alliances/requests/' + requestId + '/respond', { action });
  },

  async dissolveAlliance(allianceId) {
    return this.request('DELETE', '/api/alliances/' + allianceId);
  },

  async investIntel() {
    return this.request('POST', '/api/alliances/intel-invest');
  },

  // Admin
  async adminGetTeachers() {
    return this.request('GET', '/api/admin/teachers');
  },

  async adminDeleteTeacher(username) {
    return this.request('DELETE', '/api/admin/teachers/' + username);
  },

  async adminSearch(params) {
    const qs = Object.entries(params).filter(([,v]) => v).map(([k,v]) => k + '=' + encodeURIComponent(v)).join('&');
    return this.request('GET', '/api/admin/search?' + qs);
  },

  async adminExport(classId, format) {
    window.open('/api/admin/export/' + classId + '?format=' + format + '&token=' + this.token);
  },

  async adminGetClassrooms() {
    return this.request('GET', '/api/admin/classrooms');
  },

  async adminResetAll() {
    return this.request('POST', '/api/admin/reset-all');
  }
};
