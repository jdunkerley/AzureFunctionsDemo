const https = require('https')
const qs = require('querystring')

const environment = {}

const postOptions = {
  hostname: 'lite.realtime.nationalrail.co.uk',
  port: 443,
  path: '/OpenLDBWS/ldb11.asmx',
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml',
  }
}

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

const getXMLValue = (xml, name) => {
  const matched = xml.match(new RegExp(`<${name}>(.*?)<\/${name}>`))
  return (matched ? matched[1] : null)
}

const parseTrains = (xml, endStation) => {
  const trains = []

  let idx = 0
  while (xml.indexOf('<lt7:service>', idx) !== -1) {
    idx = xml.indexOf('<lt7:service>', idx) + 13
    newIndex = xml.indexOf('</lt7:service>', idx)

    const train = xml.substring(idx, newIndex)
    let txt = getXMLValue(train, 'lt4:std')

    const etd = getXMLValue(train, 'lt4:etd')
    if (etd !== 'On time') { txt += ` (exp ${etd})` }

    const platform = getXMLValue(train, 'lt4:platform')
    if (platform) { txt += ` Plt ${platform}` }

    const destIndex = train.indexOf('<lt5:destination>')
    const destIndex2 = destIndex === -1 ? -1 : train.indexOf('</lt5:destination>')
    const destxml = destIndex2 === -1 ? null : getXMLValue(train.substring(destIndex, destIndex2), 'lt4:locationName')
    if (destxml) { txt += ` to ${destxml}` }

    const operatorCode = getXMLValue(train, 'lt4:operatorCode')
    if (operatorCode) { txt += ` (${operatorCode})` }

    if (endStation) {
      const endIndex = train.indexOf(`<lt7:crs>${endStation}</lt7:crs>`)
      if (endIndex !== -1) {
        const endIndex2 = train.indexOf('</lt7:callingPoint>', endIndex)
        const point = train.substring(endIndex, endIndex2)
        const st = getXMLValue(point, 'lt7:st')
        if (st) { txt += ` arr ${st}` }
        const et = getXMLValue(point, 'lt7:et')
        if (et && et !== 'On time') { txt += ` (exp ${et})` }
      }
    }

    trains.push(txt)
    idx = newIndex
  }

  return trains
}

const sendTrainSearch = (startStation, endStation) => {
  const post_data = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2017-10-01/ldb/">
<soap:Header>
<typ:AccessToken><typ:TokenValue>${process.env["DARWIN_KEY"]}</typ:TokenValue></typ:AccessToken>
</soap:Header>
<soap:Body>
  <ldb:GetDepBoardWithDetailsRequest>
    <ldb:crs>${startStation}</ldb:crs>
    <ldb:filterCrs>${endStation}</ldb:filterCrs>
    <ldb:filterType>to</ldb:filterType>
    <ldb:numRows>5</ldb:numRows>
    <ldb:timeOffset>0</ldb:timeOffset>
    <ldb:timeWindow>120</ldb:timeWindow>
  </ldb:GetDepBoardWithDetailsRequest>
</soap:Body>
</soap:Envelope>`
  postOptions.headers['Content-Length'] = Buffer.byteLength(post_data)

  const post_req = https.request(postOptions, (res) => {
    const data = [];
    res.on('data', (chunk) => data.push(chunk))
      .on('end', () => {
        const xml = Buffer.concat(data).toString()
        const from = getXMLValue(xml, 'lt4:locationName')
        if (!from) {
          sendResponse(`Request failed: ${startStation} to ${endStation}`)
          return
        }

        const dest = getXMLValue(xml, 'lt4:filterLocationName')

        const trains = parseTrains(xml, endStation)

        sendResponse(`Trains from ${from} ${dest ? ` to ${dest}` : ''}\r\n${trains.join('\r\n')}`)
      })
  })
  post_req.on('error', (e) => {
    environment.context.log(e)
    sendResponse(`Request Failed`)
  })
  post_req.write(post_data)
  post_req.end()
}

module.exports = (context, req) => {
  context.log('Twilio Sent A Request')
  environment.context = context

  if (req.body) {
    const body = qs.decode(req.body)
    context.log(body)

    const payload = (body.Body || '').trim()
    context.log(payload)

    if (payload.match(/^[A-Za-z]{3}$/)) {
      sendTrainSearch(payload.toUpperCase(), '')
    } else if (payload.match(/^[A-Za-z]{3} to [A-Za-z]{3}$/)) {
      sendTrainSearch(payload.substring(0, 3).toUpperCase(), payload.substring(7, 10).toUpperCase())
    } else {
      sendResponse("Welcome to Trains... Send '[start code]' for next 5 departures. Send '[start code] to [end code]' to get next 5 trains. Send '? [Name]' to find station code.")
    }
  } else {
    sendResponse("Expected to recieve a body", 400)
  }
}