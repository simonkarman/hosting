'use strict';

exports.handler = (event, context, callback) => {
  const request = event.Records[0].cf.request;
  const fromUri = request.uri;

  if (request.uri.endsWith('/')) {
    request.uri = request.uri + 'index.html';
  } else if (!request.uri.includes('.')) {
    request.uri = request.uri + '/index.html';
  }

  if (request.uri !== fromUri) {
    console.log(`Request uri changed to "${request.uri}" (was "${fromUri}")`);
  }
  callback(null, request);
};
