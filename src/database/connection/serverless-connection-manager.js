/**
 * Serverless Connection Manager for Database Connections
 * 
 * This module provides an optimized connection manager for serverless environments,
 * focusing on minimizing cold starts, managing connection pooling efficiently,
 * and providing automatic recovery mechanisms.
 */

const mariadb = require('mariadb');
const { logger } = require('../../utils/logger');

// Configuration
const DEFAULT_CONFIG = {
  connectionLimit: 5,
  acquireTimeout: 30000,
  connectTimeout: 10000,
  idleTimeout: 60000,
  // Default exponential backoff settings
  retry: {
    maxRetries: 5,
    initialDelay: 100, // ms
    maxDelay: 10000, // ms
    factor: 2
  }
};

// Metrics collection
const metrics = {
  connectionAttempts: 0,
  connectionSuccesses: 0,
  connectionFailures: 0,
  connectionReuses: 0,
  queryExecutions: 0,
  queryErrors: 0,
  retries: 0,
  coldStarts: 0,
  lastColdStart: null,
  queriesPerformance: []
};

/**
 * Global connection pool used across function invocations
 * to minimize cold starts
 */
let globalPool = null;

/**
 * ServerlessConnectionManager class
 * 
 * Manages database connections optimized for serverless environments
 */
class ServerlessConnectionManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connections = [];
    this.isConnecting = false;
    this.lastActivity = Date.now();
    
    // Bind methods to ensure proper this context
    this.getConnection = this.getConnection.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
    this.close = this.close.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    
    // Initialize connection pool
    this.initializePool();
    
    // Set up automatic health check interval
    this.healthCheckInterval = setInterval(this.healthCheck, 30000);
  }
  
  /**
   * Initialize the connection pool
   */
  initializePool() {
    try {
      if (!globalPool) {
        logger.info('Initializing database connection pool');
        
        // Track cold start
        metrics.coldStarts++;
        metrics.lastColdStart = new Date().toISOString();
        
        // Create the connection pool
        globalPool = mariadb.createPool({
          host: process.env.DB_HOST || '211.248.190.46',
          user: process.env.DB_USER || 'hermes',
          password: process.env.DB_PASSWORD || 'mcygicng!022',
          database: process.env.DB_NAME || 'hermes',
          connectionLimit: this.config.connectionLimit,
          acquireTimeout: this.config.acquireTimeout,
          connectTimeout: this.config.connectTimeout,
          idleTimeout: this.config.idleTimeout,
          // Additional MariaDB specific options
          multipleStatements: true,
          dateStrings: true,
          timezone: 'Asia/Seoul',
          // Connection handling
          resetAfterUse: true,
          trace: process.env.NODE_ENV !== 'production'
        });
        
        logger.info('Database connection pool initialized successfully');
      } else {
        logger.debug('Reusing existing database connection pool');
        metrics.connectionReuses++;
      }
    } catch (error) {
      logger.error('Failed to initialize database connection pool', { error });
      throw new Error(`Database connection initialization failed: ${error.message}`);
    }
  }
  
  /**
   * Get a database connection from the pool with retry logic
   */
  async getConnection() {
    metrics.connectionAttempts++;
    this.lastActivity = Date.now();
    
    let retries = 0;
    let delay = this.config.retry.initialDelay;
    
    while (retries <= this.config.retry.maxRetries) {
      try {
        const connection = await globalPool.getConnection();
        metrics.connectionSuccesses++;
        this.connections.push(connection);
        
        // Log successful connection (with retry info if applicable)
        if (retries > 0) {
          logger.info(`Database connection established successfully after ${retries} retries`);
        } else {
          logger.debug('Database connection established successfully');
        }
        
        return connection;
      } catch (error) {
        metrics.connectionFailures++;
        retries++;
        
        // If we've exhausted all retries, throw the error
        if (retries > this.config.retry.maxRetries) {
          logger.error('Failed to get database connection after maximum retries', { 
            error,
            retries,
            config: this.config.retry
          });
          throw new Error(`Failed to get database connection: ${error.message}`);
        }
        
        // Calculate next retry delay with exponential backoff
        metrics.retries++;
        logger.warn(`Database connection failed, retrying (${retries}/${this.config.retry.maxRetries})`, { 
          error: error.message,
          delay
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Increase delay for next retry with exponential backoff
        delay = Math.min(delay * this.config.retry.factor, this.config.retry.maxDelay);
      }
    }
  }
  
  /**
   * Execute a database query with performance tracking and error handling
   * 
   * @param {string} sql - SQL query to execute
   * @param {Array|Object} params - Query parameters
   * @param {Object} options - Additional options
   * @returns {Promise<*>} Query results
   */
  async executeQuery(sql, params = [], options = {}) {
    const startTime = Date.now();
    let connection;
    metrics.queryExecutions++;
    this.lastActivity = Date.now();
    
    try {
      // Get database connection
      connection = await this.getConnection();
      
      // Execute the query
      const result = await connection.query(sql, params);
      
      // Record performance metrics
      const executionTime = Date.now() - startTime;
      metrics.queriesPerformance.push({
        sql: sql.substring(0, 100), // Truncate for logging
        params: JSON.stringify(params).substring(0, 100), // Truncate for logging
        executionTime,
        timestamp: new Date().toISOString()
      });
      
      // Keep only the last 100 query performance records
      if (metrics.queriesPerformance.length > 100) {
        metrics.queriesPerformance.shift();
      }
      
      // Log query performance if it's slow
      if (executionTime > 1000) {
        logger.warn('Slow query detected', {
          executionTime,
          sql: sql.substring(0, 100),
          params: JSON.stringify(params).substring(0, 100)
        });
      }
      
      return result;
    } catch (error) {
      metrics.queryErrors++;
      logger.error('Query execution failed', {
        error,
        sql: sql.substring(0, 100),
        params: JSON.stringify(params).substring(0, 100)
      });
      throw error;
    } finally {
      // Release the connection back to the pool
      if (connection) {
        try {
          connection.release();
          
          // Remove from tracked connections
          const index = this.connections.indexOf(connection);
          if (index !== -1) {
            this.connections.splice(index, 1);
          }
        } catch (error) {
          logger.error('Failed to release database connection', { error });
        }
      }
    }
  }
  
  /**
   * Close all active connections and the connection pool
   */
  async close() {
    logger.info('Closing database connections');
    
    // Close all active connections
    for (const connection of this.connections) {
      try {
        await connection.release();
      } catch (error) {
        logger.error('Error releasing connection', { error });
      }
    }
    
    // Clear the connections array
    this.connections = [];
    
    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Close the pool if it exists
    if (globalPool) {
      try {
        await globalPool.end();
        globalPool = null;
        logger.info('Database connection pool closed successfully');
      } catch (error) {
        logger.error('Error closing database connection pool', { error });
        throw error;
      }
    }
  }
  
  /**
   * Perform a health check on the connection pool
   */
  async healthCheck() {
    const currentTime = Date.now();
    const idleTime = currentTime - this.lastActivity;
    
    // If the connection has been idle for too long, close it to free resources
    if (idleTime > this.config.idleTimeout) {
      logger.info(`Closing idle connection pool (idle for ${idleTime}ms)`);
      await this.close();
      return;
    }
    
    // Verify pool is still working with a simple query
    if (globalPool) {
      try {
        const connection = await this.getConnection();
        const result = await connection.query('SELECT 1 as healthCheck');
        connection.release();
        
        if (result && result[0] && result[0].healthCheck === 1) {
          logger.debug('Database connection health check passed');
        } else {
          logger.warn('Database connection health check returned unexpected result');
        }
      } catch (error) {
        logger.error('Database connection health check failed', { error });
        
        // Reinitialize the pool if health check fails
        try {
          await this.close();
          this.initializePool();
        } catch (reinitError) {
          logger.error('Failed to reinitialize connection pool', { error: reinitError });
        }
      }
    }
  }
  
  /**
   * Get current metrics for monitoring
   */
  getMetrics() {
    return {
      ...metrics,
      currentPoolSize: globalPool ? globalPool.activeConnections() : 0,
      idleConnections: globalPool ? globalPool.idleConnections() : 0,
      totalConnections: globalPool ? globalPool.totalConnections() : 0,
      lastActivity: new Date(this.lastActivity).toISOString()
    };
  }
}

// Export a singleton instance
let connectionManagerInstance = null;

/**
 * Get the connection manager instance (singleton)
 */
function getConnectionManager(config = {}) {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ServerlessConnectionManager(config);
  }
  return connectionManagerInstance;
}

module.exports = {
  getConnectionManager,
  ServerlessConnectionManager
};
