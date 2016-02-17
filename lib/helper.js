var log = require('npmlog');
if(process.env.NODE_ENV === 'testing') {
  log.level = 'silent';
}

exports.log = log;
