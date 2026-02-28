const crypto = require('crypto');


const hashBuffer = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');


const hashString = (str) =>
  crypto.createHash('sha256').update(str).digest('hex');


const uuid = () => crypto.randomUUID();


const paginate = (page = 1, limit = 20) => {
  const parsedLimit  = Math.min(parseInt(limit, 10) || 20, 100);
  const parsedPage   = Math.max(parseInt(page, 10)  || 1,  1);
  return {
    limit:  parsedLimit,
    offset: (parsedPage - 1) * parsedLimit,
  };
};

module.exports = { hashBuffer, hashString, uuid, paginate };