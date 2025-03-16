/*
 * Copyright 2017 Scott Bender <scott@scottbender.net> and Joachim Bakke
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const worldtides = require('./sources/worldtides');
const noaa = require('./sources/noaa')

module.exports = function(app) {
  // Interval to check for updates
  let intervalId;
  // FIXME: move to config
  const updateInterval = 60 * 60 * 1000; // 1 hour

  const plugin = {
    id: "tides-api",
    name: "Tide APIs",
    description: "Plugin that fetches tide data from online sources",
    schema: {
      title: "Tides API",
      type: "object",
      properties: {
        default_ttl: {
          title: "Default TTL",
          type: "number",
          description: "The plugin won't send out duplicate calculation values for this time period (s) (0=no ttl check)",
          default: 0
        }
      }
    },
    stop() {
      clearInterval(intervalId);
    }
  };

  const sources = [
    worldtides(app, plugin),
    noaa(app, plugin)
  ];

  // Update plugin schema with sources
  sources.forEach(source => {
    Object.assign(plugin.schema.properties, {
      [source.optionKey]: {
        title: source.title,
        type: "boolean",
        default: false
      },
      ...(source.properties ?? {})
    });
  });

  plugin.start = function(props) {
    plugin.properties = props;

    intervalId = setInterval(update, updateInterval);
    update();

    async function update() {
      await Promise.all(sources.map(async source => {
        if (!props[source.optionKey]) {
          app.debug(`${source.optionKey} is not enabled, skipping...`);
          return
        }

        try {
          const position = app.getSelfPath("navigation.position.value");
          const values = await source.calculator(position);
          if(!values) return

          const delta = {
            context: "vessels." + app.selfId,
            updates: [
              {
                timestamp: new Date().toISOString(),
                values: values,
              },
            ],
          };

          app.debug("Sending delta: " + JSON.stringify(delta));
          app.handleMessage(plugin.id, delta);
        } catch (err) {
          app.setPluginError(err.message);
          app.error(err.message);
        }
      }));
    }
  }

  return plugin;
}
