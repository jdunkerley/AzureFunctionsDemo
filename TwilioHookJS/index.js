const qs = require('querystring')
const request = require('request')

const environment = {}

const sendResponse = (payload, status) => {
  environment.context.log(`Sending ${payload} to ${environment.to} ...`)

  request({
    url: `https://api.twilio.com/2010-04-01/Accounts/${process.env["TWILIO_SID"]}/Messages.json`,
    headers: {
        'Authorization': `Basic ${new Buffer(process.env["TWILIO_SID"] + ':' + process.env["TWILIO_TOKEN"]).toString('base64')}`
        },
    method: "POST",
    form: {To: environment.to, From: environment.from, Body: payload}
  }, (error, response) => {
    if (error) {
      environment.context.log("Error: " + JSON.stringify(error))
      return
    }

    environment.context.log(`Sending ${payload} to ${environment.to} ... completed: ${response.body}`)
  })
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
    environment.to = body.From
    environment.from = body.To

    if (payload.match(/^[A-Za-z]{3}$/)) {
      sendTrainSearch(payload.toUpperCase(), '')
    } else if (payload.match(/^[A-Za-z]{3} to [A-Za-z]{3}$/)) {
      sendTrainSearch(payload.substring(0, 3).toUpperCase(), payload.substring(7, 10).toUpperCase())
    } else {
      sendResponse('Welcome to Trains... \r\nSend \'[start code]\' for next 5 departures. \r\nSend \'[start code] to [end code]\' to get next 5 trains.')
    }
  } else {
    sendResponse('Expected to recieve a body', 400)
  }

  context.done()
}
