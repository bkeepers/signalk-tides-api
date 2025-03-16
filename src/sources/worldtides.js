module.exports = function (app, plugin) {
  return {
    optionKey: 'worldtides',
    title: 'Tide API from worldtides.info',
    properties: {
      worldtidesApiKey: {
        type: 'string',
        title: 'worldtides.info API key'
      }
    },
    debounceDelay: 60 * 1000,
    calculator: async function (position) {
      const timeHigh = new Date(app.getSelfPath('environment.tide.timeHigh.value'))
      const timeLow = new Date(app.getSelfPath('environment.tide.timeLow.value'))
      var now = Math.floor(new Date() / 1000)

      if(timeHigh > now && timeLow > now) {
        app.debug('Existing tide data is valid, skipping worldtides')
        return
      }

      const endPoint = new URL("https://www.worldtides.info/api");
      endPoint.search = new URLSearchParams({
        extremes: true,
        lat: position.latitude,
        lon: position.longitude,
        length: 52200,
        start: now,
        datum: "CD",
        key: plugin.properties.worldtidesApiKey,
      });

      app.debug("Fetching worldtides", endPoint.toString());
      const res = await fetch(endPoint);
      if(!res.ok) throw new Error('Failed to fetch worldtides: ' + res.statusText);

      const data = await res.json();

      if (data.status != 200) throw new Error("worldtides data: " + data.error ? data.error : "none");

      app.debug("worldtides data: " + JSON.stringify(data));

      let updates = [];
      data.extremes.slice(0, 2).forEach(({ type, dt, height}) => {
        updates.push({
          path: `environment.tide.height${type}`,
          value: height,
        });
        updates.push({
          path: `environment.tide.time${type}`,
          value: new Date(dt * 1000).toISOString(),
        });
      });
      return updates;
    }
  }
}
