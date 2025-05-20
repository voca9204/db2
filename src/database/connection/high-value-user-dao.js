/**
 * High-Value User Analyzer DAO
 * 
 * Data Access Object for high-value user analytics operations,
 * optimized for serverless environments.
 */

const BaseDAO = require('./base-dao');
const { logger } = require('../../utils/logger');

class HighValueUserDAO extends BaseDAO {
  constructor(config = {}) {
    super({
      ...config,
      tableName: 'users',
      primaryKey: 'user_id',
      // High-value user queries can be cached longer since data changes infrequently
      cacheMaxAge: 300000 // 5 minutes
    });
  }
  
  /**
   * Find active high-value users
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} High-value users
   */
  async findActiveHighValueUsers(options = {}) {
    const { days = 30, minSpend = 50000, limit = 100, offset = 0 } = options;
    
    const sql = `
      SELECT u.user_id, u.username, u.email, u.registration_date, 
             u.last_login_date, SUM(p.amount) as total_spend,
             COUNT(DISTINCT p.payment_id) as payment_count
      FROM users u
      JOIN payments p ON u.user_id = p.user_id
      WHERE u.last_login_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND u.status = 'active'
      GROUP BY u.user_id
      HAVING total_spend >= ?
      ORDER BY total_spend DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = [days, minSpend, limit, offset];
    return await this.query(sql, params, { useCache: true });
  }
  
  /**
   * Find dormant high-value users
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Dormant high-value users
   */
  async findDormantHighValueUsers(options = {}) {
    const { 
      inactiveDays = 30, 
      activePeriod = 90, 
      minSpend = 50000, 
      limit = 100, 
      offset = 0 
    } = options;
    
    const sql = `
      SELECT u.user_id, u.username, u.email, u.registration_date, 
             u.last_login_date, SUM(p.amount) as total_spend,
             COUNT(DISTINCT p.payment_id) as payment_count,
             DATEDIFF(CURRENT_DATE, u.last_login_date) as days_inactive
      FROM users u
      JOIN payments p ON u.user_id = p.user_id
      WHERE u.last_login_date < DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND u.last_login_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND u.status = 'active'
      GROUP BY u.user_id
      HAVING total_spend >= ?
      ORDER BY total_spend DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = [inactiveDays, inactiveDays + activePeriod, minSpend, limit, offset];
    return await this.query(sql, params, { useCache: true });
  }
  
  /**
   * Analyze user event participation and conversion
   * 
   * @param {Array} userIds - User IDs to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeEventParticipation(userIds, options = {}) {
    const { days = 180 } = options;
    
    if (!userIds || userIds.length === 0) {
      return { users: [], summary: { participationRate: 0, conversionRate: 0 } };
    }
    
    // Generate placeholders for user IDs
    const placeholders = userIds.map(() => '?').join(',');
    
    const sql = `
      SELECT u.user_id, u.username,
             COUNT(DISTINCT e.event_id) as events_participated,
             SUM(CASE WHEN p.payment_id IS NOT NULL 
                   AND p.created_at >= e.start_date 
                   AND p.created_at <= DATE_ADD(e.end_date, INTERVAL 7 DAY)
                 THEN 1 ELSE 0 END) as conversions,
             SUM(CASE WHEN p.payment_id IS NOT NULL 
                   AND p.created_at >= e.start_date 
                   AND p.created_at <= DATE_ADD(e.end_date, INTERVAL 7 DAY)
                 THEN p.amount ELSE 0 END) as conversion_amount
      FROM users u
      LEFT JOIN event_participants ep ON u.user_id = ep.user_id
      LEFT JOIN events e ON ep.event_id = e.event_id AND e.start_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      LEFT JOIN payments p ON u.user_id = p.user_id
      WHERE u.user_id IN (${placeholders})
      GROUP BY u.user_id
    `;
    
    const params = [days, ...userIds];
    const results = await this.query(sql, params, { useCache: options.useCache !== false });
    
    // Calculate summary statistics
    let totalUsers = results.length;
    let usersParticipated = 0;
    let usersConverted = 0;
    let totalConversionAmount = 0;
    
    for (const user of results) {
      if (user.events_participated > 0) {
        usersParticipated++;
      }
      
      if (user.conversions > 0) {
        usersConverted++;
      }
      
      totalConversionAmount += user.conversion_amount;
    }
    
    const participationRate = totalUsers > 0 ? (usersParticipated / totalUsers) : 0;
    const conversionRate = usersParticipated > 0 ? (usersConverted / usersParticipated) : 0;
    const averageConversionAmount = usersConverted > 0 ? (totalConversionAmount / usersConverted) : 0;
    
    return {
      users: results,
      summary: {
        totalUsers,
        usersParticipated,
        usersConverted,
        participationRate,
        conversionRate,
        totalConversionAmount,
        averageConversionAmount
      }
    };
  }
  
  /**
   * Find users likely to be reactivated based on past behavior
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Users with reactivation potential
   */
  async findUsersWithReactivationPotential(options = {}) {
    const { 
      minSpend = 30000,
      inactiveDays = 30,
      maxInactiveDays = 90,
      minPrevLogin = 5,
      limit = 100, 
      offset = 0 
    } = options;
    
    const sql = `
      SELECT u.user_id, u.username, u.email, u.registration_date, 
             u.last_login_date, SUM(p.amount) as total_spend,
             COUNT(DISTINCT p.payment_id) as payment_count,
             COUNT(DISTINCT l.login_id) as login_count,
             DATEDIFF(CURRENT_DATE, u.last_login_date) as days_inactive,
             COUNT(DISTINCT ep.event_id) as previous_events_joined
      FROM users u
      JOIN payments p ON u.user_id = p.user_id
      JOIN logins l ON u.user_id = l.user_id
      LEFT JOIN event_participants ep ON u.user_id = ep.user_id
      WHERE u.last_login_date < DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND u.last_login_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND u.status = 'active'
      GROUP BY u.user_id
      HAVING total_spend >= ?
         AND login_count >= ?
      ORDER BY total_spend DESC, previous_events_joined DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = [inactiveDays, maxInactiveDays, minSpend, minPrevLogin, limit, offset];
    return await this.query(sql, params, { useCache: true });
  }
  
  /**
   * Analyze event ROI for user segments
   * 
   * @param {Object} options - Analysis options
   * @returns {Promise<Array>} Event ROI analysis
   */
  async analyzeEventROI(options = {}) {
    const { days = 180, minUsers = 10 } = options;
    
    const sql = `
      SELECT e.event_id, e.event_name, e.start_date, e.end_date, e.cost,
             COUNT(DISTINCT ep.user_id) as participants,
             SUM(CASE WHEN p.payment_id IS NOT NULL 
                  AND p.created_at >= e.start_date 
                  AND p.created_at <= DATE_ADD(e.end_date, INTERVAL 7 DAY)
                THEN p.amount ELSE 0 END) as revenue,
             COUNT(DISTINCT CASE WHEN p.payment_id IS NOT NULL 
                  AND p.created_at >= e.start_date 
                  AND p.created_at <= DATE_ADD(e.end_date, INTERVAL 7 DAY)
                THEN ep.user_id ELSE NULL END) as converted_users
      FROM events e
      JOIN event_participants ep ON e.event_id = ep.event_id
      LEFT JOIN payments p ON ep.user_id = p.user_id
      WHERE e.start_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
        AND e.end_date <= CURRENT_DATE
      GROUP BY e.event_id
      HAVING participants >= ?
      ORDER BY (revenue - e.cost) DESC
    `;
    
    const results = await this.query(sql, [days, minUsers], { useCache: true });
    
    // Calculate ROI metrics
    return results.map(event => ({
      ...event,
      roi: event.cost > 0 ? ((event.revenue - event.cost) / event.cost) : 0,
      conversionRate: event.participants > 0 ? (event.converted_users / event.participants) : 0,
      revenuePerParticipant: event.participants > 0 ? (event.revenue / event.participants) : 0,
      costPerParticipant: event.participants > 0 ? (event.cost / event.participants) : 0
    }));
  }
  
  /**
   * Get user spending trends
   * 
   * @param {string|number} userId - User ID
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Spending trends
   */
  async getUserSpendingTrends(userId, options = {}) {
    const { months = 6 } = options;
    
    const sql = `
      SELECT 
        DATE_FORMAT(p.created_at, '%Y-%m-01') as month,
        SUM(p.amount) as monthly_spend,
        COUNT(p.payment_id) as payment_count,
        MAX(p.amount) as max_payment,
        MIN(p.amount) as min_payment,
        AVG(p.amount) as avg_payment
      FROM payments p
      WHERE p.user_id = ?
        AND p.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? MONTH)
      GROUP BY DATE_FORMAT(p.created_at, '%Y-%m-01')
      ORDER BY month
    `;
    
    return await this.query(sql, [userId, months], { useCache: true });
  }
}

module.exports = HighValueUserDAO;
