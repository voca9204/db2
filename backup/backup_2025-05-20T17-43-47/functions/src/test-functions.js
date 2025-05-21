const functions = require('firebase-functions');

/**
 * Simple hello world function to test Firebase Functions setup
 * 
 * @return {Object} JSON response with greeting message
 */
exports.helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello world function executed!", {structuredData: true});
  
  // Get name from query parameter or use default
  const name = request.query.name || 'World';
  
  // Return greeting response
  response.json({
    message: `Hello ${name}!`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Simple user data function that returns user info for testing
 * 
 * @return {Object} JSON response with user information
 */
exports.getUserInfo = functions.https.onRequest((request, response) => {
  functions.logger.info("User info function executed!", {structuredData: true});
  
  // Get user ID from request
  const userId = request.query.userId || '123456';
  
  // Mock user data for testing
  const userData = {
    userId: userId,
    username: `user_${userId}`,
    email: `user${userId}@example.com`,
    lastLogin: new Date().toISOString(),
    isActive: true,
    preferences: {
      theme: 'dark',
      notifications: true
    }
  };
  
  // Return user data
  response.json(userData);
});

/**
 * Simple calculation function for testing
 * 
 * @return {Object} JSON response with calculation result
 */
exports.calculate = functions.https.onRequest((request, response) => {
  functions.logger.info("Calculate function executed!", {structuredData: true});
  
  // Get operation and values from query parameters
  const operation = request.query.operation || 'add';
  const a = parseFloat(request.query.a) || 0;
  const b = parseFloat(request.query.b) || 0;
  
  let result;
  switch(operation) {
    case 'add':
      result = a + b;
      break;
    case 'subtract':
      result = a - b;
      break;
    case 'multiply':
      result = a * b;
      break;
    case 'divide':
      if (b === 0) {
        response.status(400).json({ error: "Cannot divide by zero" });
        return;
      }
      result = a / b;
      break;
    default:
      response.status(400).json({ error: "Invalid operation. Use add, subtract, multiply, or divide." });
      return;
  }
  
  // Return calculation result
  response.json({
    operation: operation,
    a: a,
    b: b,
    result: result
  });
});
