module.exports = (context, req) => {
  context.log('JavaScript HTTP trigger function processed a request.')
  context.bindings.res = {
    body: `<html><body><p>The date is ${new Date().toDateString()}<br />The time is ${new Date().toLocaleTimeString()}</p><p>Query Parameters:</p><pre>${JSON.stringify((req || {}).query, null, ' ')}</pre></body></html>`,
    headers: { 'content-type': 'text/html' }
  }
  context.done()
}
