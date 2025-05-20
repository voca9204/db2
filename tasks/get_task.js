// This file delegates to the taskmaster compatibility layer
console.log('Debug: Loading get_task module');
try {
  const handler = require('./taskmaster/get_task');
  console.log('Debug: get_task module loaded successfully');
  
  // Export the handler and also add the expected run function
  module.exports = handler;
  
  // Add a run function that Task Master might be looking for
  module.exports.run = function(options) {
    console.log('Debug: Running get_task with options:', options);
    return handler(options);
  };
} catch (err) {
  console.error('Error loading get_task module:', err);
  throw err;
}
