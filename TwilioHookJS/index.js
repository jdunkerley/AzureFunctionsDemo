const qs = require('querystring')
const request = require('request')

const environment = {}

const sendResponse = (payload, status) => {
  environment.context.res = {
    body: `<?xml version="1.0" encoding="UTF-8" ?>
    <Response>
        <Message>${payload}</Message>
    </Response>`,
    headers: {
      'content-type': 'text/xml'
    },
    status: status || 200,
    isRaw: true
  }
  environment.context.done()
}

const parseTrains = (trains) => {
  return trains.map(t => {
    var output = [
      t.standardTime,
      (t.estimatedTime && t.estimatedTime !== 'On time') ? ` (exp ${t.estimatedTime})` : '',
      t.platform ? ` Plt ${t.platform}` : '',
      t.destination ? ` to ${t.destination}` : '',
      t.operatorCode ? ` (${t.operatorCode})` : '',
      t.arrivalTime ? ` arr ${t.arrivalTime}` : '',
      (t.arrivalEstimate && t.arrivalEstimate !== 'On time') ? ` (exp ${t.arrivalEstimate})` : ''
    ].join('')
    return output
  })
}

const sendTrainSearch = (startStation, endStation) => {
  const targetUrl = `${environment.rootUrl || 'https://jdfunctiondemo.azurewebsites.net'}/trains/${startStation}/${endStation}`
  request(targetUrl, {json: true}, (error, response, body) => {
    if (error) {
      sendResponse(`Request failed: ${startStation} to ${endStation}: ${JSON.stringify(error)}`)
      return
    }

    if (!body.from) {
      sendResponse(`Request failed: ${startStation} to ${endStation}`)
      return
    }

    const trains = parseTrains(body.trains)
    sendResponse(`Trains from ${body.from} ${body.dest ? ` to ${body.dest}` : ''}\r\n${trains.join('\r\n')}`)
  })
}

module.exports = (context, req) => {
  context.log(`Twilio Sent A Request to ${req.originalUrl}`)
  environment.context = context
  environment.rootUrl = req.originalUrl.replace(/\/[^/]+\/?$/, '')

  if (req.body) {
    const body = qs.decode(req.body)
    const payload = (body.Body || '').trim()

    if (payload.match(/^[A-Za-z]{3}$/)) {
      sendTrainSearch(payload.toUpperCase(), '')
    } else if (payload.match(/^[A-Za-z]{3} to [A-Za-z]{3}$/)) {
      sendTrainSearch(payload.substring(0, 3).toUpperCase(), payload.substring(7, 10).toUpperCase())
    } else {
      sendResponse('Welcome to Trains... Send \'[start code]\' for next 5 departures. Send \'[start code] to [end code]\' to get next 5 trains. Send \'? [Name]\' to find station code.')
    }
  } else {
    sendResponse('Expected to recieve a body', 400)
  }
}
