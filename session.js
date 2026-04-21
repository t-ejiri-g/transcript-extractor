function attachRequestId(data, requestId) {
  return Object.assign({}, data, { requestId });
}

function hasMatchingRequestId(data, requestId) {
  return Boolean(data && data.content && requestId && data.requestId === requestId);
}

function isImmediateTranscriptData(data) {
  return Boolean(data && data.content && data.format !== 'dom');
}

if (typeof module !== 'undefined') {
  module.exports = {
    attachRequestId,
    hasMatchingRequestId,
    isImmediateTranscriptData
  };
}
