// This file delegates to the taskmaster compatibility layer
console.log('Debug: Loading tasks module');
try {
  const handler = require('./taskmaster/get_tasks');
  console.log('Debug: Task module loaded successfully');
  
  // Export the handler and also add the expected run function
  module.exports = handler;
  
  // Add a run function that Task Master might be looking for
  module.exports.run = function(options) {
    console.log('Debug: Running with options:', options);
    return handler(options);
  };
} catch (err) {
  console.error('Error loading task module:', err);
  throw err;
}
