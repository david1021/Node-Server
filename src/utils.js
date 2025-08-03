//utils
const getReqData = (req) => {
  return new Promise((resolve, reject) => {

    let requestData = '';

    // Listen for 'data' events, which give chunks of the request body
    req.on('data', (chunk) => {
      requestData += chunk;
    });

    // Listen for the 'end' event, which signifies that the entire request body has been read
    req.on('end', () => {
      resolve(requestData);
    });

    // Listen for the 'error' event, in case something goes wrong
    req.on('error', (err) => {
      reject(err);
    });
    
  });
};

module.exports = {getReqData};