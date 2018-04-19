const request = require('request')
const parseString = require('xml2js').parseString

function walkTree(parsed, path) {
  const next = getXMLValue(parsed, path.shift())
  if (path.length === 0) return next
  return walkTree(next || {}, path)
}

function getXMLValue(parsed, name) {
  const next = parsed[name]
  return (Array.isArray(next)) ? next[0] : next
}

function parseTrains(trainObjects, endStation) {
  const trains = []

  let idx = 0
  while (idx < trainObjects.length) {
    const train = trainObjects[idx]

    const output = {
      standardTime: getXMLValue(train, 'lt4:std'),
      estimatedTime: getXMLValue(train, 'lt4:etd'),
      platform: getXMLValue(train, 'lt4:platform'),
      operatorCode: getXMLValue(train, 'lt4:operatorCode'),
      destination: walkTree(train, ['lt5:destination', 'lt4:location', 'lt4:locationName'])
    }

    if (endStation) {
      const callingPoints = walkTree(train, ['lt7:subsequentCallingPoints', 'lt7:callingPointList'])['lt7:callingPointList'] || []

      let endIndex = 0;
      while (endIndex < callingPoints.length) {
        if (getXMLValue(callingPoints[endIndex],'lt7:crs') === endStation) {
          output.arrivalTime = getXMLValue(callingPoints[endIndex],'lt7:st')
          output.arrivalEstimate = getXMLValue(callingPoints[endIndex],'lt7:et')
        }
        endIndex++
      }
    }

    trains.push(output)
    idx++
  }

  return trains
}


function sendTrainSearch(startStation, endStation, context) {
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

  request({
    url: 'https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx',
    headers: {'Content-Type': 'text/xml'},
    method: "POST",
    body: post_data
  }, (error, response) => {
    if (error) {
      context.res = {
        body: response.body,
        headers: {
          'content-type': 'application/json'
        },
        isRaw: true,
        status: response.status
      }
      context.done()
      return
    }

    parseString(response.body, (xmlError, parsed) => {
      const body = walkTree(parsed, ['soap:Envelope', 'soap:Body', 'GetDepBoardWithDetailsResponse', 'GetStationBoardResult'])

      const output = {}
      output.from = getXMLValue(body, 'lt4:locationName')
      output.dest = getXMLValue(body, 'lt4:filterLocationName')
      output.trains = parseTrains(walkTree(body, ['lt7:trainServices'])['lt7:service'], endStation)
  
      context.res = {
        body: JSON.stringify(output),
        headers: {
          'content-type': 'application/json'
        },
        isRaw: true,
        status: 200
      }
  
      context.done()
    })
  })
}

module.exports = function (context, req) {
  context.log('JavaScript HTTP trigger function processed a request.')
  sendTrainSearch(req.params.src.toUpperCase(), (req.params.dest || '').toUpperCase(), context)
}