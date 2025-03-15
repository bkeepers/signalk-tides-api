module.exports = function (app, plugin) {
  var heightLowTime, heightHighTime, heightLow, heightHigh

  return {
    group: 'tides',
    optionKey: 'worldtides',
    title: 'Tide API from worldtides.info',
    derivedFrom: [ 'navigation.position'],
    properties: {
      worldtidesApiKey: {
        type: 'string',
        title: 'worldtides.info API key'
      }
    },
    debounceDelay: 60 * 1000,
    calculator: async function (position) {
      app.debug('starting worldtides')

      var now = Math.floor(new Date()/1000)
      if(app.getSelfPath('environment.tide.timeHigh')){
        heightHighTime = app.getSelfPath('environment.tide.timeHigh')
      }
      if(app.getSelfPath('environment.tide.timeLow')){
        heightLowTime = app.getSelfPath('environment.tide.timeLow')
      }
      const endPoint = 'https://www.worldtides.info/api?extremes&lat='+position.latitude+'&lon='+position.longitude+'&length=52200&start='+now+'&datum=LAT&key='+plugin.properties.tides.worldtidesApiKey

      if( typeof heightHighTime == 'undefined' || (now < heightHighTime || now < heightLowTime)){
        const res = await fetch(endPoint);
        if(!res.ok) {
          throw new Error('Failed to fetch worldtides: ' + res.statusText);
        }

        return worldtidesToDeltas(await res.json());
      } else {
        app.debug('Skipping worldtides')
        return
      }

      function worldtidesToDeltas(response){
        if ( response.status != 200){
          throw new Error('worldtides response: ' + response.error ? response.error : 'none')
        }

        app.debug("updating tide");
        app.debug(JSON.stringify(response))
        let updates = []
        response.extremes.forEach((extreme, index) => {
          if (index > 1) return
          if (extreme.type == 'Low'){
            heightLowTime = new Date(extreme.dt*1000).toISOString()
            heightLow = extreme.height
            updates.push({
              path: 'environment.tide.heightLow',
              value: heightLow,
            })
            updates.push({
              path: 'environment.tide.timeLow',
              value: heightLowTime
            })
          }
          if (extreme.type == 'High'){
            heightHighTime = new Date(extreme.dt*1000).toISOString()
            heightHigh = extreme.height
            updates.push({
              path: 'environment.tide.heightHigh',
              value: heightHigh
            })
            updates.push({
              path: 'environment.tide.timeHigh',
              value: heightHighTime
            })
          }
        })
        return updates
      }
    }
  }
}
