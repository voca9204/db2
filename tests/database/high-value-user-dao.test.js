/**
 * Tests for High-Value User DAO
 */

const HighValueUserDAO = require('../../src/database/connection/high-value-user-dao');

describe('HighValueUserDAO', () => {
  // Mock connectionManager
  const mockConnectionManager = {
    getConnection: jest.fn(),
    executeQuery: jest.fn()
  };
  
  // Mock connection
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
    mockConnectionManager.getConnection.mockResolvedValue(mockConnection);
    
    // Mock getConnectionManager to return our mock
    jest.mock('../../src/database/connection/serverless-connection-manager', () => ({
      getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager)
    }));
  });
  
  test('should initialize with correct table name and primary key', () => {
    const dao = new HighValueUserDAO();
    expect(dao.tableName).toBe('users');
    expect(dao.primaryKey).toBe('user_id');
  });
  
  test('findActiveHighValueUsers should execute correct query', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([{ user_id: 1, username: 'test' }]);
    
    const result = await dao.findActiveHighValueUsers({ days: 60, minSpend: 100000 });
    
    expect(dao.query).toHaveBeenCalled();
    expect(dao.query.mock.calls[0][1]).toEqual([60, 100000, 100, 0]);
    expect(result).toEqual([{ user_id: 1, username: 'test' }]);
  });
  
  test('findDormantHighValueUsers should execute correct query', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([{ user_id: 2, username: 'dormant' }]);
    
    const result = await dao.findDormantHighValueUsers({ 
      inactiveDays: 45, 
      activePeriod: 120, 
      minSpend: 80000 
    });
    
    expect(dao.query).toHaveBeenCalled();
    expect(dao.query.mock.calls[0][1]).toEqual([45, 165, 80000, 100, 0]);
    expect(result).toEqual([{ user_id: 2, username: 'dormant' }]);
  });
  
  test('analyzeEventParticipation should return empty result for empty userIds', async () => {
    const dao = new HighValueUserDAO();
    
    const result = await dao.analyzeEventParticipation([]);
    
    expect(result).toEqual({ 
      users: [], 
      summary: { 
        participationRate: 0, 
        conversionRate: 0 
      } 
    });
  });
  
  test('analyzeEventParticipation should calculate correct summary', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([
      { user_id: 1, events_participated: 2, conversions: 1, conversion_amount: 10000 },
      { user_id: 2, events_participated: 0, conversions: 0, conversion_amount: 0 },
      { user_id: 3, events_participated: 3, conversions: 2, conversion_amount: 20000 }
    ]);
    
    const result = await dao.analyzeEventParticipation([1, 2, 3]);
    
    expect(dao.query).toHaveBeenCalled();
    expect(result.summary).toEqual({
      totalUsers: 3,
      usersParticipated: 2,
      usersConverted: 2,
      participationRate: 2/3,
      conversionRate: 2/2,
      totalConversionAmount: 30000,
      averageConversionAmount: 15000
    });
  });
  
  test('findUsersWithReactivationPotential should execute correct query', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([{ user_id: 3, username: 'reactivate' }]);
    
    const result = await dao.findUsersWithReactivationPotential({ 
      minSpend: 20000,
      inactiveDays: 20,
      maxInactiveDays: 60,
      minPrevLogin: 3
    });
    
    expect(dao.query).toHaveBeenCalled();
    expect(dao.query.mock.calls[0][1]).toEqual([20, 60, 20000, 3, 100, 0]);
    expect(result).toEqual([{ user_id: 3, username: 'reactivate' }]);
  });
  
  test('analyzeEventROI should calculate ROI metrics correctly', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([
      { 
        event_id: 1, 
        event_name: 'Test Event', 
        cost: 10000, 
        participants: 100, 
        revenue: 50000, 
        converted_users: 20 
      }
    ]);
    
    const result = await dao.analyzeEventROI();
    
    expect(dao.query).toHaveBeenCalled();
    expect(result[0]).toEqual({
      event_id: 1,
      event_name: 'Test Event',
      cost: 10000,
      participants: 100,
      revenue: 50000,
      converted_users: 20,
      roi: 4, // (50000 - 10000) / 10000
      conversionRate: 0.2, // 20 / 100
      revenuePerParticipant: 500, // 50000 / 100
      costPerParticipant: 100 // 10000 / 100
    });
  });
  
  test('getUserSpendingTrends should execute correct query', async () => {
    const dao = new HighValueUserDAO();
    dao.query = jest.fn().mockResolvedValue([
      { month: '2025-04-01', monthly_spend: 15000 },
      { month: '2025-05-01', monthly_spend: 20000 }
    ]);
    
    const result = await dao.getUserSpendingTrends(1, { months: 3 });
    
    expect(dao.query).toHaveBeenCalled();
    expect(dao.query.mock.calls[0][1]).toEqual([1, 3]);
    expect(result).toEqual([
      { month: '2025-04-01', monthly_spend: 15000 },
      { month: '2025-05-01', monthly_spend: 20000 }
    ]);
  });
});
