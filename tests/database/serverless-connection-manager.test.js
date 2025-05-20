/**
 * Tests for Serverless Connection Manager
 */

const { ServerlessConnectionManager, getConnectionManager } = require('../../src/database/connection/serverless-connection-manager');

describe('ServerlessConnectionManager', () => {
  // Mock mariadb module
  const mockPool = {
    getConnection: jest.fn(),
    end: jest.fn(),
    activeConnections: jest.fn().mockReturnValue(0),
    idleConnections: jest.fn().mockReturnValue(0),
    totalConnections: jest.fn().mockReturnValue(0)
  };
  
  const mockConnection = {
    query: jest.fn(),
    release: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn()
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock connection
    mockPool.getConnection.mockResolvedValue(mockConnection);
    mockConnection.query.mockResolvedValue([{ healthCheck: 1 }]);
    
    // Mock global pool
    global.globalPool = null;
  });
  
  test('should initialize the connection pool', async () => {
    const connectionManager = new ServerlessConnectionManager();
    expect(connectionManager.config).toBeDefined();
    expect(connectionManager.connections).toEqual([]);
  });
  
  test('getConnection should acquire a connection from the pool', async () => {
    const connectionManager = new ServerlessConnectionManager();
    connectionManager.initializePool = jest.fn();
    global.globalPool = mockPool;
    
    const connection = await connectionManager.getConnection();
    
    expect(mockPool.getConnection).toHaveBeenCalled();
    expect(connection).toBe(mockConnection);
    expect(connectionManager.connections).toContain(mockConnection);
  });
  
  test('executeQuery should execute a query and release the connection', async () => {
    const connectionManager = new ServerlessConnectionManager();
    connectionManager.getConnection = jest.fn().mockResolvedValue(mockConnection);
    mockConnection.query.mockResolvedValue([{ id: 1, name: 'Test' }]);
    
    const result = await connectionManager.executeQuery('SELECT * FROM test');
    
    expect(connectionManager.getConnection).toHaveBeenCalled();
    expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM test', []);
    expect(mockConnection.release).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1, name: 'Test' }]);
  });
  
  test('close should release all connections and end the pool', async () => {
    const connectionManager = new ServerlessConnectionManager();
    connectionManager.connections = [mockConnection, mockConnection];
    global.globalPool = mockPool;
    
    await connectionManager.close();
    
    expect(mockConnection.release).toHaveBeenCalledTimes(2);
    expect(mockPool.end).toHaveBeenCalled();
    expect(connectionManager.connections).toEqual([]);
    expect(global.globalPool).toBeNull();
  });
  
  test('healthCheck should verify pool is working', async () => {
    const connectionManager = new ServerlessConnectionManager();
    connectionManager.getConnection = jest.fn().mockResolvedValue(mockConnection);
    mockConnection.query.mockResolvedValue([{ healthCheck: 1 }]);
    
    await connectionManager.healthCheck();
    
    expect(connectionManager.getConnection).toHaveBeenCalled();
    expect(mockConnection.query).toHaveBeenCalledWith('SELECT 1 as healthCheck');
    expect(mockConnection.release).toHaveBeenCalled();
  });
  
  test('getConnectionManager should return a singleton instance', () => {
    const manager1 = getConnectionManager();
    const manager2 = getConnectionManager();
    
    expect(manager1).toBe(manager2);
  });
});
