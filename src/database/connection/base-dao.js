/**
 * Base Data Access Object for Serverless Database Interactions
 * 
 * Provides a reusable pattern for database operations with optimization
 * for serverless environments, including query caching and batch operations.
 */

const { getConnectionManager } = require('./serverless-connection-manager');
const { makeRetryable } = require('./retry-utils');
const { logger } = require('../../utils/logger');

/**
 * Base Data Access Object class
 */
class BaseDAO {
  constructor(config = {}) {
    this.tableName = config.tableName || '';
    this.primaryKey = config.primaryKey || 'id';
    this.connectionManager = getConnectionManager(config.connection);
    
    // Query cache for frequently used queries
    this.queryCache = new Map();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cacheMaxSize = config.cacheMaxSize || 100;
    this.cacheMaxAge = config.cacheMaxAge || 60000; // 1 minute default
    
    // Make database operations retryable
    this.executeQuery = makeRetryable(this.connectionManager.executeQuery);
  }
  
  /**
   * Generate a cache key for a query
   * 
   * @param {string} sql - SQL query
   * @param {Array|Object} params - Query parameters
   * @returns {string} Cache key
   */
  _generateCacheKey(sql, params) {
    return `${sql}:${JSON.stringify(params)}`;
  }
  
  /**
   * Check if a cached result is still valid
   * 
   * @param {Object} cachedItem - Cached item to check
   * @returns {boolean} Whether the cache is still valid
   */
  _isCacheValid(cachedItem) {
    if (!cachedItem) return false;
    return (Date.now() - cachedItem.timestamp) < this.cacheMaxAge;
  }
  
  /**
   * Add result to cache
   * 
   * @param {string} key - Cache key
   * @param {*} result - Result to cache
   */
  _addToCache(key, result) {
    if (!this.cacheEnabled) return;
    
    // Add to cache with timestamp
    this.queryCache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    // Prune cache if it exceeds maximum size
    if (this.queryCache.size > this.cacheMaxSize) {
      // Remove oldest entries
      const keys = [...this.queryCache.keys()];
      const oldestKey = keys[0];
      this.queryCache.delete(oldestKey);
    }
  }
  
  /**
   * Execute a query with caching
   * 
   * @param {string} sql - SQL query
   * @param {Array|Object} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<*>} Query results
   */
  async query(sql, params = [], options = {}) {
    const useCache = options.useCache !== false && this.cacheEnabled;
    
    if (useCache) {
      const cacheKey = this._generateCacheKey(sql, params);
      const cachedItem = this.queryCache.get(cacheKey);
      
      if (this._isCacheValid(cachedItem)) {
        logger.debug('Cache hit for query', { sql: sql.substring(0, 100) });
        return cachedItem.result;
      }
      
      // Execute query and cache results
      const result = await this.executeQuery(sql, params);
      this._addToCache(cacheKey, result);
      return result;
    }
    
    // Execute query without caching
    return await this.executeQuery(sql, params);
  }
  
  /**
   * Find a record by ID
   * 
   * @param {*} id - Record ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Record
   */
  async findById(id, options = {}) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    const result = await this.query(sql, [id], options);
    return result && result[0] ? result[0] : null;
  }
  
  /**
   * Find records by a field value
   * 
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Records
   */
  async findByField(field, value, options = {}) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ?`;
    return await this.query(sql, [value], options);
  }
  
  /**
   * Find records with multiple conditions
   * 
   * @param {Object} conditions - Field-value conditions
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Records
   */
  async findByConditions(conditions = {}, options = {}) {
    const fields = Object.keys(conditions);
    
    if (fields.length === 0) {
      return await this.findAll(options);
    }
    
    const whereClause = fields.map(field => `${field} = ?`).join(' AND ');
    const params = fields.map(field => conditions[field]);
    
    const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause}`;
    return await this.query(sql, params, options);
  }
  
  /**
   * Find all records
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Records
   */
  async findAll(options = {}) {
    const limit = options.limit ? `LIMIT ${parseInt(options.limit, 10)}` : '';
    const offset = options.offset ? `OFFSET ${parseInt(options.offset, 10)}` : '';
    const orderBy = options.orderBy ? `ORDER BY ${options.orderBy}` : '';
    
    const sql = `SELECT * FROM ${this.tableName} ${orderBy} ${limit} ${offset}`.trim();
    return await this.query(sql, [], options);
  }
  
  /**
   * Insert a record
   * 
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Insert result
   */
  async insert(data) {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => data[field]);
    
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    return await this.executeQuery(sql, values);
  }
  
  /**
   * Update a record
   * 
   * @param {*} id - Record ID
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Update result
   */
  async update(id, data) {
    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...fields.map(field => data[field]), id];
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
    return await this.executeQuery(sql, values);
  }
  
  /**
   * Delete a record
   * 
   * @param {*} id - Record ID
   * @returns {Promise<Object>} Delete result
   */
  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    return await this.executeQuery(sql, [id]);
  }
  
  /**
   * Execute a batch of operations in a transaction
   * 
   * @param {Function} batchFn - Function containing batch operations
   * @returns {Promise<*>} Transaction result
   */
  async executeBatch(batchFn) {
    let connection;
    
    try {
      // Get a connection from the pool
      connection = await this.connectionManager.getConnection();
      
      // Begin transaction
      await connection.beginTransaction();
      
      // Execute batch function with the connection
      const result = await batchFn(connection);
      
      // Commit transaction
      await connection.commit();
      
      return result;
    } catch (error) {
      // Rollback transaction on error
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('Error rolling back transaction', { error: rollbackError });
        }
      }
      
      logger.error('Transaction failed', { error });
      throw error;
    } finally {
      // Release connection back to the pool
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('Error releasing connection', { error: releaseError });
        }
      }
    }
  }
  
  /**
   * Clear the query cache
   */
  clearCache() {
    this.queryCache.clear();
    logger.debug('Query cache cleared');
  }
  
  /**
   * Remove specific entries from the cache
   * 
   * @param {string|RegExp} pattern - Pattern to match cache keys
   */
  invalidateCache(pattern) {
    if (!pattern) {
      this.clearCache();
      return;
    }
    
    const keys = [...this.queryCache.keys()];
    let invalidatedCount = 0;
    
    for (const key of keys) {
      if (typeof pattern === 'string' && key.includes(pattern)) {
        this.queryCache.delete(key);
        invalidatedCount++;
      } else if (pattern instanceof RegExp && pattern.test(key)) {
        this.queryCache.delete(key);
        invalidatedCount++;
      }
    }
    
    logger.debug(`Invalidated ${invalidatedCount} cache entries`);
  }
}

module.exports = BaseDAO;
